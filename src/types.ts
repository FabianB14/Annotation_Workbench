// Core data models for the Annotation Workbench web app.

/** The two independently-segmented annotation tracks. */
export type TrackId = 'speech' | 'av';

/** A single editable caption field (one of the two on a track). */
export interface CaptionDef {
  id: string;
  name: string;
  description: string;
}

/** A track = a named pair of captions (e.g. Speech Transcription + Characteristics). */
export interface TrackDef {
  id: TrackId;
  name: string;
  /** Exactly two captions: [caption 1, caption 2]. */
  captions: [CaptionDef, CaptionDef];
}

export interface RulesSpec {
  segmentationRules: string;
  tracks: {
    speech: TrackDef;
    av: TrackDef;
  };
  requiredVocabulary: string[];
  hardConstraints: string[];
  commonMistakes: string[];
}

export interface Project {
  id: string;
  name: string;
  rulesRawText: string;
  confirmedSpecJson: string; // stringified RulesSpec (may be empty until confirmed)
  videoName: string;
  /** Video is persisted as a Blob in IndexedDB, keyed by the project id. */
  hasVideo: boolean;
  videoDurationMs: number;

  // --- Playback-speed normalization ---
  /** User-selected capture speed (dropdown/custom). 1 = normal. */
  captureSpeed: number;
  /** Optional true source duration in seconds (entered by the user). */
  sourceDurationSec: number | null;
  /** Recording duration measured from the uploaded file, in seconds. */
  recordingDurationSec: number | null;
  /** Resolved correction factor S actually applied (source/recording). 1 = none. */
  appliedSpeed: number;
  /** QA line describing the normalization, embedded in exports. */
  normalizationQa: string;

  createdAt: number;
  updatedAt: number;
}

/**
 * An annotation: a time-coded entry on one track with exactly two captions.
 * (What the UI calls an "annotation"; each track has its own independent set.)
 */
export interface AnnotationSegment {
  id: string;
  projectId: string;
  track: TrackId;
  startTimeMs: number;
  endTimeMs: number;
  /** map of the track's two captionIds -> caption string, stringified as JSON */
  captionsJson: string;
  /** JSON object map of captionId -> violation reason, or null */
  violationsJson: string | null;
}
