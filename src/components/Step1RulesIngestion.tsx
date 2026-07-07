import { useEffect, useRef, useState } from 'react';
import type { Store } from '../store';
import { MODEL_LABELS } from '../services/gemini';
import { extractTextFromFile } from '../services/documentExtractor';
import { getTrackList, BASELINE_HARD_RULES } from '../services/spec';
import {
  SPEED_PRESETS,
  MIN_SPEED,
  MAX_SPEED,
  detectedSpeed,
  isMismatch,
  resolveSpeed,
} from '../services/normalization';
import { safeParseObject, parseTimeInput } from '../utils';
import { Switch, Spinner } from './Shared';
import {
  DocumentIcon,
  UploadIcon,
  VideoIcon,
  BrainIcon,
  ArrowForwardIcon,
  EditIcon,
  ClockIcon,
} from './Icons';

const SAMPLE_RULES = `# Annotation Guidelines for Scenic Video Projects

1. Segmentation Rules
The video must be segmented continuously in blocks of 2 to 7 seconds. Ensure transitions and camera motion bounds act as boundaries. Timestamps are formatted as standard decimal seconds.

2. Sensory Capture Columns
- Transcription: Verbatim dialog. If speaker is unclear use default tag '[unintelligible]'. If speech overlaps, separate via vertical pipeline '|'.
- Visual: Describe the frame scene, camera movement, actions. Put text overlay elements in single quotes, e.g. 'Annotation Studio'.
- Audio: Describe background sounds and sound effects. Surround SFX in square brackets e.g. [laughter], [ambient synthesizer].

3. Guidelines and Word Boundaries
- Max 20 words per Transcription lane box.
- Never let visual activities leak into Audio column.
- Common mistakes to avoid: ignoring background hums, forgetting text overlays on screen.`;

export default function Step1RulesIngestion({ store }: { store: Store }) {
  const { isGenerating, generationProgress, fastDraft, currentProject, simulationMode } = store;

  const [projectName, setProjectName] = useState('');
  const [rulesText, setRulesText] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoName, setVideoName] = useState('');
  const [parsedSpecJson, setParsedSpecJson] = useState('');

  // Playback-speed normalization inputs
  const [captureSpeedSel, setCaptureSpeedSel] = useState('1');
  const [customSpeed, setCustomSpeed] = useState('2');
  const [sourceDurationStr, setSourceDurationStr] = useState('');
  const [recordingDurationSec, setRecordingDurationSec] = useState<number | null>(null);
  const [mismatch, setMismatch] = useState<{ detected: number; selected: number } | null>(null);

  const captureSpeed = (() => {
    if (captureSpeedSel === 'custom') {
      const n = parseFloat(customSpeed);
      if (isNaN(n)) return 1;
      return Math.min(MAX_SPEED, Math.max(MIN_SPEED, n));
    }
    return parseFloat(captureSpeedSel);
  })();
  const sourceSec = parseTimeInput(sourceDurationStr);
  const detected = detectedSpeed(sourceSec, recordingDurationSec);

  const rulesInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Sync when the active project changes (e.g. loaded from selector).
  useEffect(() => {
    if (currentProject) {
      setProjectName(currentProject.name);
      setRulesText(currentProject.rulesRawText);
      setVideoName(currentProject.videoName);
      setParsedSpecJson(currentProject.confirmedSpecJson);
      // Restore the last-used speed settings (always shown, never silent).
      const cs = currentProject.captureSpeed ?? 1;
      if (SPEED_PRESETS.includes(cs)) {
        setCaptureSpeedSel(String(cs));
      } else {
        setCaptureSpeedSel('custom');
        setCustomSpeed(String(cs));
      }
      setSourceDurationStr(
        currentProject.sourceDurationSec != null ? String(currentProject.sourceDurationSec) : ''
      );
      setRecordingDurationSec(currentProject.recordingDurationSec ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  const onRulesFile = async (file: File) => {
    const text = await extractTextFromFile(file);
    setRulesText(text);
    if (!projectName.trim()) setProjectName(`Project - ${stripExt(file.name)}`);
  };

  const onVideoFile = (file: File) => {
    setVideoFile(file);
    setVideoName(file.name);
    if (!projectName.trim()) setProjectName(`Project - ${stripExt(file.name)}`);
    // Measure the recording duration for speed detection.
    setRecordingDurationSec(null);
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      setRecordingDurationSec(isFinite(v.duration) && v.duration > 0 ? v.duration : null);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      setRecordingDurationSec(null);
    };
    v.src = url;
  };

  const doIngest = (useDetected: boolean) => {
    const appliedSpeed = resolveSpeed(
      { captureSpeed, sourceDurationSec: sourceSec, recordingDurationSec },
      useDetected
    );
    store.ingestRules(projectName, rulesText, videoFile, {
      captureSpeed,
      sourceDurationSec: sourceSec,
      recordingDurationSec,
      appliedSpeed,
    });
  };

  const onIngestClick = () => {
    // Blocking mismatch check: dropdown set AND detected differs by > 5%.
    if (detected != null && isMismatch(detected, captureSpeed)) {
      setMismatch({ detected, selected: captureSpeed });
      return;
    }
    doIngest(detected != null); // prefer detected when we have it
  };

  // ---- render: generating ----
  if (isGenerating) {
    return (
      <div className="scroll">
        <div className="step-body">
          <div className="card center-col" style={{ minHeight: 200 }}>
            <Spinner className="lg" />
            <div style={{ fontWeight: 600 }}>{generationProgress}</div>
            <div className="muted">Powered by Google Gemini Models</div>
          </div>
        </div>
      </div>
    );
  }

  // ---- render: spec review ----
  if (parsedSpecJson.trim()) {
    const spec = safeParseObject(parsedSpecJson);
    const trackList = getTrackList(parsedSpecJson);
    const constraints: string[] = Array.isArray(spec.hardConstraints) ? spec.hardConstraints : [];

    return (
      <div className="scroll">
        <div className="step-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 className="h1 primary-text">Dynamic Rules Spec Confirmed</h2>
              <p className="muted">
                Gemini synthesized the uploaded rules. Edit the checklist spec if needed.
              </p>
            </div>
            <button
              className="icon-btn"
              title="Re-ingest"
              onClick={() => setParsedSpecJson('')}
            >
              <EditIcon size={20} className="primary-text" />
            </button>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div className="spec-section">
              <div className="spec-row primary-text">Segmentation Rules</div>
              <div className="muted">
                {spec.segmentationRules || 'Continuous segment flow.'}
              </div>
              <hr className="divider" />
              <div className="spec-row primary-text">Annotation Tracks (2 captions each)</div>
              {trackList.map((track) => (
                <div key={track.id} style={{ paddingLeft: 4 }}>
                  <div className="name" style={{ marginBottom: 2 }}>
                    {track.name} <span className="muted">[{track.id}]</span>
                  </div>
                  {track.captions.map((cap, i) => (
                    <div key={cap.id} className="spec-col">
                      <span className="primary-text">{i + 1}.</span>
                      <div>
                        <div className="name">
                          {cap.name} <span className="muted">[id: {cap.id}]</span>
                        </div>
                        <div className="desc">{cap.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <hr className="divider" />
              <div className="spec-row" style={{ color: 'var(--amber)' }}>
                Quality Constraints
              </div>
              {constraints.map((c, i) => (
                <div key={i} className="muted" style={{ paddingLeft: 8 }}>
                  - {c}
                </div>
              ))}

              <hr className="divider" />
              <div className="spec-row" style={{ color: 'var(--amber)' }}>
                Always-on Hard Rules
              </div>
              {BASELINE_HARD_RULES.map((c, i) => (
                <div key={i} className="muted" style={{ paddingLeft: 8 }}>
                  - {c}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="field-label">Structured Spec JSON Schema</label>
            <textarea
              className="textarea mono"
              style={{ minHeight: 180 }}
              value={parsedSpecJson}
              onChange={(e) => setParsedSpecJson(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn btn-outline" onClick={() => setParsedSpecJson('')}>
              Re-Ingest
            </button>
            <button
              className="btn btn-primary"
              onClick={() => store.saveConfirmedSpec(parsedSpecJson)}
            >
              Confirm Spec & Ingest Video <ArrowForwardIcon size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- render: inputs ----
  const canIngest = rulesText.trim() && videoName.trim();

  return (
    <div className="scroll">
      <div className="step-body">
        <div>
          <h2 className="h1">Step 1: Project Setup &amp; Ingestion</h2>
          <p className="muted">
            Define your annotation constraints. Upload any custom instructions, rules, or guidelines,
            plus your MP4 video file.
          </p>
        </div>

        <div>
          <label className="field-label">Project Name</label>
          <input
            className="text-input"
            placeholder="Project Name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </div>

        {/* Rules document */}
        <div className="card" style={{ padding: 16 }}>
          <div className="upload-head">
            <div className="left">
              <DocumentIcon size={18} className="primary-text" />
              Annotation Rules (.md, .txt, .pdf, .docx)
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className="btn btn-outline"
                style={{ padding: '6px 10px' }}
                onClick={() => {
                  setRulesText(SAMPLE_RULES);
                  if (!projectName.trim()) setProjectName('Project - Scenic Sample');
                }}
              >
                Load Sample
              </button>
              <button className="icon-btn" onClick={() => rulesInputRef.current?.click()}>
                <UploadIcon size={18} className="primary-text" />
              </button>
              <input
                ref={rulesInputRef}
                type="file"
                accept=".md,.txt,.pdf,.docx,text/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onRulesFile(f);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
          <textarea
            className="textarea"
            style={{ marginTop: 8, minHeight: 160 }}
            placeholder="Paste guidelines or upload rules file above..."
            value={rulesText}
            onChange={(e) => setRulesText(e.target.value)}
          />
        </div>

        {/* Video file */}
        <div className="card" style={{ padding: 16 }}>
          <div className="upload-head">
            <div style={{ minWidth: 0 }}>
              <div className="left">
                <VideoIcon size={18} className="primary-text" />
                Video File Input
              </div>
              <div
                className={videoName ? 'primary-text' : 'muted'}
                style={{ fontSize: 12, marginTop: 4, fontWeight: videoName ? 600 : 400 }}
              >
                {videoName || 'No video selected'}
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => videoInputRef.current?.click()}>
              <UploadIcon size={16} /> Select Video
            </button>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onVideoFile(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        {/* Capture speed & timeline normalization */}
        <div className="card" style={{ padding: 16 }}>
          <div className="upload-head" style={{ marginBottom: 10 }}>
            <div className="left">
              <ClockIcon size={18} className="primary-text" /> Capture Speed &amp; Timeline
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="field-label">Speed the video was recorded/played at</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  className="text-input"
                  style={{ maxWidth: 170 }}
                  value={captureSpeedSel}
                  onChange={(e) => setCaptureSpeedSel(e.target.value)}
                >
                  <option value="1">1x (normal)</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="1.75">1.75x</option>
                  <option value="2">2x</option>
                  <option value="custom">Custom…</option>
                </select>
                {captureSpeedSel === 'custom' && (
                  <input
                    className="text-input mono"
                    style={{ maxWidth: 130 }}
                    type="number"
                    min={MIN_SPEED}
                    max={MAX_SPEED}
                    step={0.05}
                    placeholder="0.25–4.0"
                    value={customSpeed}
                    onChange={(e) => setCustomSpeed(e.target.value)}
                  />
                )}
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                If you screen-recorded a video playing at 2x, select 2x. The app restores normal speed
                before processing, so exported timestamps land on the real timeline.
              </div>
            </div>

            <div>
              <label className="field-label">Source duration (optional, strongly encouraged)</label>
              <input
                className="text-input mono"
                placeholder="e.g. 5:07.75 or 307.75"
                value={sourceDurationStr}
                onChange={(e) => setSourceDurationStr(e.target.value)}
              />
              <div className="muted" style={{ marginTop: 6 }}>
                The true length of the original video. Enables automatic speed detection and duration
                validation.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div className="chip">
                Recording:&nbsp;
                <span className="mono">
                  {recordingDurationSec != null ? `${recordingDurationSec.toFixed(2)}s` : '—'}
                </span>
              </div>
              {detected != null && (
                <div className="chip">
                  Detected:&nbsp;
                  <span className="mono primary-text">{detected.toFixed(2)}x</span>
                </div>
              )}
              <div className="chip">
                Active:&nbsp;<span className="mono primary-text">{captureSpeed.toFixed(2)}x</span>
              </div>
            </div>

            {detected != null && isMismatch(detected, captureSpeed) && (
              <div className="badge-amber">
                Heads up: detected {detected.toFixed(2)}x differs from your selected{' '}
                {captureSpeed.toFixed(2)}x — you'll be asked to confirm on ingest.
              </div>
            )}
          </div>
        </div>

        {/* Model toggle */}
        <div className="card" style={{ padding: 16 }}>
          <div className="upload-head">
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Annotation Generation Engine</div>
              <div className="muted">
                {fastDraft
                  ? `Fast Draft (${MODEL_LABELS.fast}) - Quick & optimized`
                  : `High Accuracy (${MODEL_LABELS.pro}) - Full sensory logic`}
              </div>
            </div>
            <Switch checked={fastDraft} onChange={store.setFastDraft} />
          </div>
        </div>

        <button
          className="btn btn-primary btn-lg"
          disabled={!canIngest}
          onClick={onIngestClick}
        >
          <BrainIcon size={18} /> Ingest &amp; Process Annotation Spec
        </button>

        {!videoFile && videoName && (
          <p className="badge-amber">
            This project references a previously uploaded video. Re-select the video file if you want
            to (re)generate annotations.
          </p>
        )}

        {simulationMode && (
          <p className="badge-amber">
            Demo Mode Active: Ingesting rules will produce high-fidelity simulation specs instantly
            for offline testing. Add a Gemini API key (⚙️) for live analysis.
          </p>
        )}
      </div>

      {/* Blocking speed-mismatch confirmation */}
      {mismatch && (
        <div className="modal-backdrop" onClick={() => setMismatch(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="h1" style={{ fontSize: 16, color: 'var(--amber)' }}>
              Capture speed mismatch
            </h2>
            <p className="muted">
              You selected <strong>{mismatch.selected.toFixed(2)}x</strong>, but the recording appears
              to be <strong>{mismatch.detected.toFixed(2)}x</strong> of the source (
              {sourceSec?.toFixed(2)}s source ÷ {recordingDurationSec?.toFixed(2)}s recording). Using
              the wrong value will shift every exported timestamp.
            </p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button
                className="btn btn-outline"
                onClick={() => {
                  setMismatch(null);
                  doIngest(false);
                }}
              >
                Use my selection ({mismatch.selected.toFixed(2)}x)
              </button>
              <button className="btn btn-outline" onClick={() => setMismatch(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setMismatch(null);
                  doIngest(true);
                }}
              >
                Use detected ({mismatch.detected.toFixed(2)}x)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}
