// localStorage persistence for projects, segments, and settings.
// Replaces the Room database from the original Android app.

import type { Project, AnnotationSegment } from '../types';

const PROJECTS_KEY = 'aw.projects';
const SEGMENTS_KEY = 'aw.segments';
const API_KEY = 'aw.apiKey';
const MODEL_PREF_KEY = 'aw.fastDraft';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// --- Projects ---

export function loadProjects(): Project[] {
  const projects = read<Project[]>(PROJECTS_KEY, []);
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveProjects(projects: Project[]): void {
  write(PROJECTS_KEY, projects);
}

// --- Segments (keyed by projectId) ---

type SegmentMap = Record<string, AnnotationSegment[]>;

export function loadAllSegments(): SegmentMap {
  return read<SegmentMap>(SEGMENTS_KEY, {});
}

export function loadSegments(projectId: string): AnnotationSegment[] {
  const all = loadAllSegments();
  return all[projectId] ?? [];
}

export function saveSegments(projectId: string, segments: AnnotationSegment[]): void {
  const all = loadAllSegments();
  all[projectId] = segments;
  write(SEGMENTS_KEY, all);
}

export function deleteProjectSegments(projectId: string): void {
  const all = loadAllSegments();
  delete all[projectId];
  write(SEGMENTS_KEY, all);
}

// --- Settings ---

export function loadApiKey(): string {
  return localStorage.getItem(API_KEY) ?? '';
}

export function saveApiKey(key: string): void {
  localStorage.setItem(API_KEY, key);
}

export function loadFastDraftPref(): boolean {
  const raw = localStorage.getItem(MODEL_PREF_KEY);
  return raw === null ? true : raw === 'true';
}

export function saveFastDraftPref(fast: boolean): void {
  localStorage.setItem(MODEL_PREF_KEY, String(fast));
}

// --- IDs ---

let counter = 0;
export function newId(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}_${Math.random().toString(36).slice(2, 8)}`;
}
