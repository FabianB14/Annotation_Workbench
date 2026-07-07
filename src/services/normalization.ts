// Playback-Speed Normalization ("Speed Correction").
//
// A recording captured at non-1x speed (e.g. a 2x screen recording) has a
// compressed timeline: content plays faster and the file is shorter than the
// real source. All analysis timestamps must land on the SOURCE timeline.
//
// Correction factor S = source_duration / recording_duration (the "capture
// speed"). A 153.9s recording of a 307.75s source -> S = 2.0. The source time
// of an event measured at recording time t is: t_source = t_recording * S.
//
// This module is engine-agnostic: today the correction is applied at the single
// ingest boundary (timestamps * S) and the player maps between the source
// timeline and the underlying recording. The ffmpeg helpers below describe the
// equivalent media re-encode for a future in-browser/offline path.

/** Preset capture speeds offered in the dropdown (plus "Custom"). */
export const SPEED_PRESETS = [1, 1.25, 1.5, 1.75, 2];

/** Custom speed accepted range. */
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4.0;

/** Within ±2% of 1.0 -> treat as 1x and skip normalization. */
export const SKIP_BAND = 0.02;
/** Detected vs selected disagreement beyond this fraction -> blocking modal. */
export const MISMATCH_TOL = 0.05;
/** Corrected duration must land within this many seconds of the source. */
export const DURATION_TOL_SEC = 1.0;

export interface NormalizationInput {
  captureSpeed: number;
  sourceDurationSec: number | null;
  recordingDurationSec: number | null;
}

/** Detected capture speed = source / recording (how much faster the recording plays). */
export function detectedSpeed(
  sourceSec: number | null,
  recordingSec: number | null
): number | null {
  if (!sourceSec || !recordingSec || recordingSec <= 0 || sourceSec <= 0) return null;
  return sourceSec / recordingSec;
}

/** True if the detected speed differs from the user's selection by > MISMATCH_TOL. */
export function isMismatch(detected: number | null, selected: number): boolean {
  if (detected == null || selected <= 0) return false;
  return Math.abs(detected - selected) > MISMATCH_TOL * selected;
}

/**
 * Resolve the correction factor S. Auto-detected speed wins over the dropdown
 * when available and `useDetected` is true (the mismatch modal decides this).
 * Anything within ±2% of 1.0 collapses to exactly 1 (skip).
 */
export function resolveSpeed(input: NormalizationInput, useDetected: boolean): number {
  const det = detectedSpeed(input.sourceDurationSec, input.recordingDurationSec);
  let s = useDetected && det != null ? det : input.captureSpeed;
  if (!isFinite(s) || s <= 0) s = 1;
  if (Math.abs(s - 1) <= SKIP_BAND) s = 1;
  return s;
}

/** Map a recording-timeline millisecond value to the source timeline. */
export function correctMs(recordingMs: number, s: number): number {
  return Math.round(recordingMs * s);
}

/**
 * Decompose an audio tempo factor into a chain where each link is in [0.5, 2.0]
 * (ffmpeg's atempo only accepts that range). e.g. 0.25 -> [0.5, 0.5].
 */
export function atempoChain(tempo: number): number[] {
  if (!isFinite(tempo) || tempo <= 0) return [1];
  const out: number[] = [];
  let r = tempo;
  while (r < 0.5 - 1e-9) {
    out.push(0.5);
    r /= 0.5;
  }
  while (r > 2.0 + 1e-9) {
    out.push(2.0);
    r /= 2.0;
  }
  out.push(Number(r.toFixed(6)));
  return out;
}

/** The equivalent ffmpeg command that would re-encode the media to true 1x. */
export function ffmpegCommand(s: number): string {
  const chain = atempoChain(1 / s)
    .map((f) => `atempo=${f}`)
    .join(',');
  return (
    `ffmpeg -i input.mp4 -filter_complex ` +
    `"[0:v]setpts=${s.toFixed(4)}*PTS[v];[0:a]${chain}[a]" ` +
    `-map "[v]" -map "[a]" normalized_1x.mp4`
  );
}

export interface ValidationResult {
  ok: boolean;
  correctedSec: number | null;
  message?: string;
}

/**
 * Validate that applying S produces the expected source duration. Only possible
 * when the source duration is known; otherwise we pass through.
 */
export function validateCorrection(
  recordingSec: number | null,
  sourceSec: number | null,
  s: number
): ValidationResult {
  const correctedSec = recordingSec != null ? recordingSec * s : null;
  if (!sourceSec || recordingSec == null) return { ok: true, correctedSec };
  if (Math.abs(correctedSec! - sourceSec) <= DURATION_TOL_SEC) return { ok: true, correctedSec };
  return {
    ok: false,
    correctedSec,
    message:
      `Corrected duration is ${correctedSec!.toFixed(2)}s but source is ${sourceSec.toFixed(2)}s — ` +
      `the recording speed may not be uniform (buffering/variable playback), or the selected speed ` +
      `is incorrect. Re-record at 1x, or fix the speed/source duration.`,
  };
}

/** QA line embedded in the export header. */
export function qaLine(
  s: number,
  sourceSec: number | null,
  recordingSec: number | null
): string {
  const corrected = recordingSec != null ? (recordingSec * s).toFixed(2) + 's' : 'n/a';
  const status = s === 1 ? 'SKIPPED' : 'OK';
  return (
    `normalization: S=${s.toFixed(2)}, ` +
    `source=${sourceSec != null ? sourceSec.toFixed(2) + 's' : 'n/a'}, ` +
    `recording=${recordingSec != null ? recordingSec.toFixed(2) + 's' : 'n/a'}, ` +
    `corrected=${corrected}, status=${status}`
  );
}
