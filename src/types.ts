// Core data models for the Annotation Workbench web app.
// Ported from the original Android/Room entities.

export interface SpecColumn {
  id: string;
  name: string;
  description: string;
  required: boolean;
}

export interface RulesSpec {
  segmentationRules: string;
  columns: SpecColumn[];
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
  /**
   * Video is persisted as a Blob in IndexedDB, keyed by the project id.
   * We only keep the file name in the project record.
   */
  hasVideo: boolean;
  videoDurationMs: number;
  createdAt: number;
  updatedAt: number;
}

export interface AnnotationSegment {
  id: string;
  projectId: string;
  startTimeMs: number;
  endTimeMs: number;
  /** map of columnId -> caption string, stringified as JSON */
  captionsJson: string;
  /** JSON object map of columnId -> violation reason, or null */
  violationsJson: string | null;
}
