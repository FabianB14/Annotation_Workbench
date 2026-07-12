// Helpers for the track-based rules spec. The spec is user-editable JSON, so we
// always read it defensively and fill in the fixed 2x2 structure with defaults.

import type { TrackId, TrackDef } from '../types';
import { safeParseObject } from '../utils';

export const TRACK_IDS: TrackId[] = ['speech', 'av'];

/**
 * Baseline hard rules applied to EVERY annotation, regardless of the uploaded
 * rules document. Injected into both generation and linting prompts.
 */
export const BASELINE_HARD_RULES: string[] = [
  "If music or a song is playing, do NOT put the song's lyrics in the Speech Transcription unless a person present in the video is actually singing them. Background/soundtrack lyrics are not speech — note the music in the Audio caption instead (e.g. \"[song playing]\").",
  'Only transcribe as speech what a person in the video actually says or sings on camera/on mic. Never attribute background-track vocals to a speaker.',
  'Keep each caption in its own lane — do not let audio/music content leak into Speech, or visual content into Audio.',
];

export const DEFAULT_TRACKS: Record<TrackId, TrackDef> = {
  speech: {
    id: 'speech',
    name: 'Speech',
    captions: [
      {
        id: 'speechTranscription',
        name: 'Speech Transcription',
        description:
          'Verbatim spoken words, including stutters and fillers. Use the null marker for unclear speech.',
      },
      {
        id: 'speechCharacteristics',
        name: 'Speech Characteristics',
        description: 'Tone, accent, gender, pace, emotion, and delivery of the speech.',
      },
    ],
  },
  av: {
    id: 'av',
    name: 'Audio/Visual',
    captions: [
      {
        id: 'audio',
        name: 'Audio',
        description: 'Non-speech sounds and sound effects (music, ambience, [laughter], etc.).',
      },
      {
        id: 'visual',
        name: 'Visual',
        description: "On-screen scene, camera movement, actions, and on-screen text in 'single quotes'.",
      },
    ],
  },
};

/** Read the two track definitions from a spec JSON string, filling defaults. */
export function getTracks(specJson: string): Record<TrackId, TrackDef> {
  const spec = safeParseObject(specJson);
  const raw = spec.tracks && typeof spec.tracks === 'object' ? spec.tracks : {};

  const build = (id: TrackId): TrackDef => {
    const def = DEFAULT_TRACKS[id];
    const t = (raw as any)[id] ?? {};
    const caps = Array.isArray(t.captions) ? t.captions : [];
    const cap = (i: number) => {
      const c = caps[i] ?? {};
      return {
        id: String(c.id || def.captions[i].id),
        name: String(c.name || def.captions[i].name),
        description: String(c.description ?? def.captions[i].description),
      };
    };
    return { id, name: String(t.name || def.name), captions: [cap(0), cap(1)] };
  };

  return { speech: build('speech'), av: build('av') };
}

/** Ordered list of the two tracks. */
export function getTrackList(specJson: string): TrackDef[] {
  const tracks = getTracks(specJson);
  return TRACK_IDS.map((id) => tracks[id]);
}
