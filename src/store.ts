// Central application store. A React hook that mirrors the original
// AnnotationViewModel: it owns projects, segments, the current step, generation
// progress and all the mutating actions, persisting to localStorage / IndexedDB.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnnotationSegment, Project } from './types';
import * as storage from './services/storage';
import * as videoStore from './services/videoStore';
import * as gemini from './services/gemini';
import { cleanJsonString, safeParseObject } from './utils';
import type { TimeFormat } from './utils';

export interface Store {
  projects: Project[];
  currentProject: Project | null;
  segments: AnnotationSegment[];
  currentStep: number;
  isGenerating: boolean;
  generationProgress: string;
  isLinting: boolean;
  errorMessage: string | null;
  fastDraft: boolean;
  apiKey: string;
  simulationMode: boolean;
  timeFormat: TimeFormat;

  setStep: (step: number) => void;
  setFastDraft: (fast: boolean) => void;
  setTimeFormat: (format: TimeFormat) => void;
  setApiKey: (key: string) => void;
  clearError: () => void;
  selectProject: (project: Project) => void;
  deleteProject: (projectId: string) => void;

  ingestRules: (
    projectName: string,
    rulesText: string,
    videoFile: File | null
  ) => Promise<void>;
  saveConfirmedSpec: (editedSpecJson: string) => void;
  resetProjectSegments: () => void;
  generateAnnotations: () => Promise<void>;

  updateCellText: (segmentId: string, columnId: string, value: string) => void;
  updateSegmentTimes: (segmentId: string, startMs: number, endMs: number) => void;
  splitSegment: (segmentId: string, splitMs: number) => void;
  mergeSegmentWithNext: (segmentId: string) => void;
  deleteSegment: (segmentId: string) => void;
  addSegment: () => void;
  lintAllSegments: () => Promise<void>;
  clearLintWarnings: () => void;
  regenerateCell: (
    segmentId: string,
    columnId: string,
    columnName: string,
    existingValue: string,
    userInstruction: string
  ) => Promise<void>;
}

export function useStore(): Store {
  const [projects, setProjects] = useState<Project[]>(() => storage.loadProjects());
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [segments, setSegments] = useState<AnnotationSegment[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [isLinting, setIsLinting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fastDraft, setFastDraftState] = useState<boolean>(() => storage.loadFastDraftPref());
  const [apiKey, setApiKeyState] = useState<string>(() => storage.loadApiKey());
  const [simulationMode, setSimulationMode] = useState<boolean>(true);
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>(() => storage.loadTimeFormat());

  // Keep the gemini service key in sync and recompute simulation flag.
  useEffect(() => {
    gemini.setApiKey(apiKey);
    setSimulationMode(gemini.isSimulationMode());
  }, [apiKey]);

  // Auto-select the most-recently-updated project on first load.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const list = storage.loadProjects();
    if (list.length > 0) selectProjectInternal(list[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- persistence helpers ---

  const persistProjects = useCallback((next: Project[]) => {
    const sorted = [...next].sort((a, b) => b.updatedAt - a.updatedAt);
    setProjects(sorted);
    storage.saveProjects(sorted);
  }, []);

  const persistSegments = useCallback((projectId: string, next: AnnotationSegment[]) => {
    setSegments(next);
    storage.saveSegments(projectId, next);
  }, []);

  const currentProjectRef = useRef<Project | null>(null);
  currentProjectRef.current = currentProject;
  const segmentsRef = useRef<AnnotationSegment[]>([]);
  segmentsRef.current = segments;

  // --- selection ---

  function selectProjectInternal(project: Project) {
    setCurrentProject(project);
    const segs = storage.loadSegments(project.id);
    setSegments(segs);
    if (!project.confirmedSpecJson || project.confirmedSpecJson.trim() === '') {
      setCurrentStep(1);
    } else if (segs.length > 0) {
      setCurrentStep(3);
    } else {
      setCurrentStep(2);
    }
  }

  const selectProject = useCallback((project: Project) => {
    selectProjectInternal(project);
  }, []);

  const setStep = useCallback((step: number) => setCurrentStep(step), []);

  const setFastDraft = useCallback((fast: boolean) => {
    setFastDraftState(fast);
    storage.saveFastDraftPref(fast);
  }, []);

  const setTimeFormat = useCallback((format: TimeFormat) => {
    setTimeFormatState(format);
    storage.saveTimeFormat(format);
  }, []);

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    storage.saveApiKey(key);
  }, []);

  const clearError = useCallback(() => setErrorMessage(null), []);

  const deleteProject = useCallback(
    (projectId: string) => {
      const next = projects.filter((p) => p.id !== projectId);
      persistProjects(next);
      storage.deleteProjectSegments(projectId);
      void videoStore.deleteVideo(projectId);
      if (currentProject?.id === projectId) {
        const nextProj = next[0] ?? null;
        if (nextProj) selectProjectInternal(nextProj);
        else {
          setCurrentProject(null);
          setSegments([]);
          setCurrentStep(1);
        }
      }
    },
    [projects, currentProject, persistProjects]
  );

  // --- Step 1: ingest rules ---

  const ingestRules = useCallback(
    async (projectName: string, rulesText: string, videoFile: File | null) => {
      setIsGenerating(true);
      setGenerationProgress('Analyzing annotation rules document...');
      setErrorMessage(null);
      try {
        const parsedSpec = await gemini.parseRulesSpec(rulesText, !fastDraft);
        const cleanedSpec = cleanJsonString(parsedSpec);

        const videoName = videoFile?.name ?? '';
        const id = storage.newId('proj');
        const now = Date.now();
        const newProj: Project = {
          id,
          name: projectName.trim() || `Project - ${stripExt(videoName)}`,
          rulesRawText: rulesText,
          confirmedSpecJson: cleanedSpec,
          videoName,
          hasVideo: !!videoFile,
          videoDurationMs: 0,
          createdAt: now,
          updatedAt: now,
        };

        if (videoFile) await videoStore.saveVideo(id, videoFile);

        persistProjects([newProj, ...projects]);
        setCurrentProject(newProj);
        setSegments([]);
        setCurrentStep(1); // stay on step 1 to review/edit the spec
      } catch (e) {
        console.error('Rules ingestion failed:', e);
        setErrorMessage(`Failed to parse rules: ${(e as Error).message}`);
      } finally {
        setIsGenerating(false);
      }
    },
    [fastDraft, projects, persistProjects]
  );

  const saveConfirmedSpec = useCallback(
    (editedSpecJson: string) => {
      const proj = currentProjectRef.current;
      if (!proj) return;
      try {
        JSON.parse(editedSpecJson); // validate
        const updated: Project = {
          ...proj,
          confirmedSpecJson: editedSpecJson,
          updatedAt: Date.now(),
        };
        setCurrentProject(updated);
        persistProjects(projects.map((p) => (p.id === updated.id ? updated : p)));
        setCurrentStep(2);
      } catch (e) {
        setErrorMessage(`Invalid specification JSON: ${(e as Error).message}`);
      }
    },
    [projects, persistProjects]
  );

  const resetProjectSegments = useCallback(() => {
    const proj = currentProjectRef.current;
    if (!proj) return;
    persistSegments(proj.id, []);
    setCurrentStep(2);
  }, [persistSegments]);

  // --- Step 2: generate annotations ---

  const generateAnnotations = useCallback(async () => {
    const proj = currentProjectRef.current;
    if (!proj) return;
    setIsGenerating(true);
    setGenerationProgress('Preparing video pipeline...');
    setErrorMessage(null);
    try {
      const videoBlob = await videoStore.getVideo(proj.id);
      if (!videoBlob) throw new Error('Video not found. Please re-upload the video in Step 1.');

      const resultText = await gemini.generateAnnotations(
        videoBlob,
        proj.videoName,
        proj.confirmedSpecJson,
        !fastDraft,
        (msg) => setGenerationProgress(msg)
      );

      const cleaned = cleanJsonString(resultText);
      const arr = JSON.parse(cleaned);
      if (!Array.isArray(arr)) throw new Error('Model did not return a segment array.');

      const newSegments: AnnotationSegment[] = arr.map((obj: any) => {
        const startSec = Number(obj.startTime ?? 0);
        const endSec = Number(obj.endTime ?? 0);
        const captions: Record<string, any> = {};
        for (const key of Object.keys(obj)) {
          if (key !== 'startTime' && key !== 'endTime') captions[key] = obj[key];
        }
        return {
          id: storage.newId('seg'),
          projectId: proj.id,
          startTimeMs: Math.round(startSec * 1000),
          endTimeMs: Math.round(endSec * 1000),
          captionsJson: JSON.stringify(captions),
          violationsJson: null,
        };
      });

      persistSegments(proj.id, newSegments);
      setCurrentStep(3);
    } catch (e) {
      console.error('Annotation generation failed:', e);
      setErrorMessage(`Annotation Generation failed: ${(e as Error).message}.`);
    } finally {
      setIsGenerating(false);
    }
  }, [fastDraft, persistSegments]);

  // --- Step 3: workspace edits ---

  const commitSegments = useCallback(
    (updater: (segs: AnnotationSegment[]) => AnnotationSegment[]) => {
      const proj = currentProjectRef.current;
      if (!proj) return;
      const next = updater(segmentsRef.current);
      persistSegments(proj.id, next);
    },
    [persistSegments]
  );

  const updateCellText = useCallback(
    (segmentId: string, columnId: string, value: string) => {
      commitSegments((segs) =>
        segs.map((s) => {
          if (s.id !== segmentId) return s;
          const caps = safeParseObject(s.captionsJson);
          caps[columnId] = value;
          return { ...s, captionsJson: JSON.stringify(caps) };
        })
      );
    },
    [commitSegments]
  );

  const updateSegmentTimes = useCallback(
    (segmentId: string, startMs: number, endMs: number) => {
      if (startMs >= endMs) return;
      commitSegments((segs) =>
        segs.map((s) => (s.id === segmentId ? { ...s, startTimeMs: startMs, endTimeMs: endMs } : s))
      );
    },
    [commitSegments]
  );

  const splitSegment = useCallback(
    (segmentId: string, splitMs: number) => {
      commitSegments((segs) => {
        const idx = segs.findIndex((s) => s.id === segmentId);
        if (idx === -1) return segs;
        const target = segs[idx];
        if (splitMs <= target.startTimeMs || splitMs >= target.endTimeMs) return segs;
        const seg1: AnnotationSegment = { ...target, endTimeMs: splitMs };
        const seg2: AnnotationSegment = {
          ...target,
          id: storage.newId('seg'),
          startTimeMs: splitMs,
          endTimeMs: target.endTimeMs,
        };
        const next = [...segs];
        next.splice(idx, 1, seg1, seg2);
        return next;
      });
    },
    [commitSegments]
  );

  const mergeSegmentWithNext = useCallback(
    (segmentId: string) => {
      commitSegments((segs) => {
        const idx = segs.findIndex((s) => s.id === segmentId);
        if (idx === -1 || idx >= segs.length - 1) return segs;
        const target = segs[idx];
        const next = segs[idx + 1];
        const targetCaps = safeParseObject(target.captionsJson);
        const nextCaps = safeParseObject(next.captionsJson);
        const merged: Record<string, string> = {};
        for (const key of Object.keys(targetCaps)) {
          merged[key] = `${targetCaps[key] ?? ''} ${nextCaps[key] ?? ''}`.trim();
        }
        const mergedSeg: AnnotationSegment = {
          ...target,
          endTimeMs: next.endTimeMs,
          captionsJson: JSON.stringify(merged),
        };
        const out = [...segs];
        out.splice(idx, 2, mergedSeg);
        return out;
      });
    },
    [commitSegments]
  );

  const deleteSegment = useCallback(
    (segmentId: string) => {
      commitSegments((segs) => segs.filter((s) => s.id !== segmentId));
    },
    [commitSegments]
  );

  const addSegment = useCallback(() => {
    const proj = currentProjectRef.current;
    if (!proj) return;
    commitSegments((segs) => {
      const startMs = segs.length > 0 ? segs[segs.length - 1].endTimeMs : 0;
      const endMs = startMs + 5000;
      const blankCaps: Record<string, string> = {};
      const spec = safeParseObject(proj.confirmedSpecJson);
      const columns: any[] = Array.isArray(spec.columns) ? spec.columns : [];
      if (columns.length > 0) for (const c of columns) blankCaps[c.id] = '';
      else blankCaps.transcription = '';
      const newSeg: AnnotationSegment = {
        id: storage.newId('seg'),
        projectId: proj.id,
        startTimeMs: startMs,
        endTimeMs: endMs,
        captionsJson: JSON.stringify(blankCaps),
        violationsJson: null,
      };
      return [...segs, newSeg];
    });
  }, [commitSegments]);

  const lintAllSegments = useCallback(async () => {
    const proj = currentProjectRef.current;
    if (!proj) return;
    setIsLinting(true);
    try {
      const current = segmentsRef.current;
      const results = await Promise.all(
        current.map(async (seg) => {
          const resultJson = await gemini.lintSegment(
            seg.startTimeMs / 1000,
            seg.endTimeMs / 1000,
            seg.captionsJson,
            proj.confirmedSpecJson,
            !fastDraft
          );
          return { id: seg.id, violations: cleanJsonString(resultJson) };
        })
      );
      const map = new Map(results.map((r) => [r.id, r.violations]));
      commitSegments((segs) =>
        segs.map((s) => (map.has(s.id) ? { ...s, violationsJson: map.get(s.id)! } : s))
      );
    } catch (e) {
      console.error('Batch linting failed:', e);
    } finally {
      setIsLinting(false);
    }
  }, [fastDraft, commitSegments]);

  const clearLintWarnings = useCallback(() => {
    commitSegments((segs) => segs.map((s) => (s.violationsJson ? { ...s, violationsJson: null } : s)));
  }, [commitSegments]);

  const regenerateCell = useCallback(
    async (
      segmentId: string,
      columnId: string,
      columnName: string,
      existingValue: string,
      userInstruction: string
    ) => {
      const proj = currentProjectRef.current;
      if (!proj) return;
      const target = segmentsRef.current.find((s) => s.id === segmentId);
      if (!target) return;

      // show inline progress in the cell
      const setCell = (value: string) =>
        commitSegments((segs) =>
          segs.map((s) => {
            if (s.id !== segmentId) return s;
            const caps = safeParseObject(s.captionsJson);
            caps[columnId] = value;
            return { ...s, captionsJson: JSON.stringify(caps) };
          })
        );

      setCell('...Regenerating...');
      try {
        const responseText = await gemini.regenerateSegmentCell(
          target.startTimeMs / 1000,
          target.endTimeMs / 1000,
          columnId,
          columnName,
          existingValue,
          userInstruction,
          proj.confirmedSpecJson,
          !fastDraft
        );
        setCell(responseText);
      } catch (e) {
        console.error('Regenerate cell error:', e);
        setCell(existingValue);
        setErrorMessage(`Failed to regenerate cell: ${(e as Error).message}`);
      }
    },
    [fastDraft, commitSegments]
  );

  return {
    projects,
    currentProject,
    segments,
    currentStep,
    isGenerating,
    generationProgress,
    isLinting,
    errorMessage,
    fastDraft,
    apiKey,
    simulationMode,
    timeFormat,
    setStep,
    setFastDraft,
    setTimeFormat,
    setApiKey,
    clearError,
    selectProject,
    deleteProject,
    ingestRules,
    saveConfirmedSpec,
    resetProjectSegments,
    generateAnnotations,
    updateCellText,
    updateSegmentTimes,
    splitSegment,
    mergeSegmentWithNext,
    deleteSegment,
    addSegment,
    lintAllSegments,
    clearLintWarnings,
    regenerateCell,
  };
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}
