// Gemini service for the Annotation Workbench web app.
// Uses the official @google/genai SDK, runs in the browser with a user-supplied
// API key, and falls back to high-fidelity simulation when no key is present.
//
// The app has two independently-segmented tracks (speech, av), each with two
// captions. Generation returns { speech: [...], av: [...] }.

import { GoogleGenAI, Type } from '@google/genai';
import type { RulesSpec, TrackDef } from '../types';
import { getTracks, DEFAULT_TRACKS, BASELINE_HARD_RULES } from './spec';

const baselineRulesBlock = BASELINE_HARD_RULES.map((r, i) => `  ${i + 1}. ${r}`).join('\n');

// Large output budget so long videos aren't truncated mid-JSON.
const MAX_OUTPUT_TOKENS = 65536;

/**
 * Build a strict response schema for the two-track output. Forcing structured
 * output stops the model from emitting invalid JSON (e.g. unescaped quotes in a
 * caption), which otherwise breaks the whole generation.
 */
function buildResponseSchema(tracks: Record<'speech' | 'av', TrackDef>) {
  const segmentSchema = (t: TrackDef) => ({
    type: Type.OBJECT,
    properties: {
      startTime: { type: Type.NUMBER },
      endTime: { type: Type.NUMBER },
      [t.captions[0].id]: { type: Type.STRING },
      [t.captions[1].id]: { type: Type.STRING },
    },
    required: ['startTime', 'endTime', t.captions[0].id, t.captions[1].id],
    propertyOrdering: ['startTime', 'endTime', t.captions[0].id, t.captions[1].id],
  });
  return {
    type: Type.OBJECT,
    properties: {
      speech: { type: Type.ARRAY, items: segmentSchema(tracks.speech) },
      av: { type: Type.ARRAY, items: segmentSchema(tracks.av) },
    },
    required: ['speech', 'av'],
    propertyOrdering: ['speech', 'av'],
  };
}

const FLASH_MODEL = 'gemini-2.5-flash';
const PRO_MODEL = 'gemini-2.5-pro';

export const MODEL_LABELS = {
  fast: 'Gemini 2.5 Flash',
  pro: 'Gemini 2.5 Pro',
};

let runtimeApiKey = '';

export function setApiKey(key: string): void {
  runtimeApiKey = (key ?? '').trim();
}

export function getEffectiveApiKey(): string {
  if (runtimeApiKey && !runtimeApiKey.includes('MY_GEMINI_API_KEY')) return runtimeApiKey;
  const envKey = (process.env.GEMINI_API_KEY ?? '').trim();
  if (envKey && !envKey.includes('MY_GEMINI_API_KEY')) return envKey;
  return '';
}

export function isSimulationMode(): boolean {
  return getEffectiveApiKey() === '';
}

function client(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: getEffectiveApiKey() });
}

function modelFor(usePro: boolean): string {
  return usePro ? PRO_MODEL : FLASH_MODEL;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Public API ---------------------------------------------------------

/**
 * Step 1: Parse and summarize the raw rules document into the two-track spec.
 */
export async function parseRulesSpec(rulesText: string, usePro: boolean): Promise<string> {
  if (isSimulationMode()) return simulateRulesSpec(rulesText);

  const prompt = `
Summarize this annotation rules document into a structured JSON specification for a
two-track video annotation tool. There are exactly two annotation tracks, each with
exactly two caption fields, and each track is segmented on its OWN independent timeline:

- "speech" track: caption 1 = Speech Transcription, caption 2 = Speech Characteristics.
- "av" track: caption 1 = Audio, caption 2 = Visual.

The JSON MUST have these fields:
1. "segmentationRules": a string describing how each track should be segmented (speech by
   utterance, audio/visual by scene/sound change) and the timestamp format (decimal seconds).
2. "tracks": an object with keys "speech" and "av". Each is an object with:
   - "name": display name of the track.
   - "captions": an array of EXACTLY two caption objects, each with:
       - "id": short camelCase id (keep: speechTranscription, speechCharacteristics, audio, visual)
       - "name": the caption title (editable to match the rules' wording)
       - "description": what belongs in this caption according to the rules.
3. "requiredVocabulary": array of exact required strings/keywords.
4. "hardConstraints": array of strings for word/character limits or forbidden content.
5. "commonMistakes": array of strings warning about common errors.

Rules document text:
${rulesText}

Return ONLY a valid JSON object matching the schema above. Keep the caption ids exactly as
listed. Do not include markdown code blocks or any explanation outside the JSON.`.trim();

  try {
    return await callGemini(modelFor(usePro), prompt, 0.2, true);
  } catch (e) {
    console.error('Failed to parse rules spec via Gemini:', e);
    return simulateRulesSpec(rulesText);
  }
}

/**
 * Step 2: Generate annotations for both tracks, each independently segmented.
 * Returns a JSON string: { "speech": [...], "av": [...] }.
 */
export async function generateAnnotations(
  videoBlob: Blob,
  videoName: string,
  rulesSpecJson: string,
  usePro: boolean,
  onProgress: (msg: string) => void
): Promise<string> {
  if (isSimulationMode()) {
    onProgress('Analyzing video timeline...');
    await delay(1500);
    onProgress('Segmenting speech and audio/visual tracks...');
    await delay(1500);
    return simulateAnnotations(rulesSpecJson);
  }

  const model = modelFor(usePro);
  const mimeType = videoBlob.type || 'video/mp4';

  let fileUri: string;
  let fileMime: string;
  try {
    onProgress('Uploading video to Gemini Files API...');
    const uploaded = await client().files.upload({
      file: videoBlob,
      config: { mimeType, displayName: videoName || `video_${Date.now()}` },
    });
    const activated = await waitForFileActive(uploaded.name!, onProgress);
    fileUri = activated.uri!;
    fileMime = activated.mimeType || mimeType;
  } catch (e) {
    console.error('Files API processing/upload failed:', e);
    onProgress('Files API failed, trying inline base64 fallback (smaller videos only)...');
    try {
      return await generateAnnotationsInline(videoBlob, mimeType, rulesSpecJson, model, onProgress);
    } catch (fallbackErr) {
      console.error('Inline fallback failed:', fallbackErr);
      return simulateAnnotations(rulesSpecJson);
    }
  }

  onProgress('Scanning video content...');
  const systemPrompt = buildGenerationPrompt(rulesSpecJson);

  onProgress('Segmenting speech and audio/visual tracks...');
  try {
    const response = await client().models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { fileUri, mimeType: fileMime } },
            { text: 'Please annotate this entire video for both tracks according to the instructions.' },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: buildResponseSchema(getTracks(rulesSpecJson)),
        temperature: 0.2,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    });
    return response.text ?? simulateAnnotations(rulesSpecJson);
  } catch (e) {
    console.error('Video processing failed:', e);
    return simulateAnnotations(rulesSpecJson);
  }
}

async function generateAnnotationsInline(
  videoBlob: Blob,
  mimeType: string,
  rulesSpecJson: string,
  model: string,
  onProgress: (msg: string) => void
): Promise<string> {
  onProgress('Reading video file...');
  if (videoBlob.size > 20 * 1024 * 1024) {
    throw new Error('File is too large for inline API. Please use a smaller clip or verify your API key.');
  }

  onProgress('Transmitting video chunk to Gemini...');
  const base64Video = await blobToBase64(videoBlob);
  const systemPrompt = buildGenerationPrompt(rulesSpecJson);

  const response = await client().models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64Video } },
          { text: 'Annotate this video for both tracks.' },
        ],
      },
    ],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: buildResponseSchema(getTracks(rulesSpecJson)),
      temperature: 0.2,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  });
  return response.text ?? '{"speech":[],"av":[]}';
}

function buildGenerationPrompt(rulesSpecJson: string): string {
  const tracks = getTracks(rulesSpecJson);
  const describe = (t: TrackDef) =>
    `  "${t.id}" track (${t.name}) — segment on its own timeline. Each object has:\n` +
    `    - "startTime": number (seconds), "endTime": number (seconds)\n` +
    `    - "${t.captions[0].id}": ${t.captions[0].name} — ${t.captions[0].description}\n` +
    `    - "${t.captions[1].id}": ${t.captions[1].name} — ${t.captions[1].description}`;

  return `
You are a professional video annotator. Produce a structured, two-track annotation of the
uploaded video following the rules specification strictly.

There are TWO tracks, each segmented on its OWN independent timeline (a speech utterance and
a scene/sound change do NOT need to line up):

${describe(tracks.speech)}

${describe(tracks.av)}

Rules specification:
${rulesSpecJson}

Baseline hard rules (ALWAYS apply, in addition to the rules spec above):
${baselineRulesBlock}

Precision instructions:
- Cover the whole video timeline continuously within each track, independently.
- Only describe what is directly evidenced in the video. If speech is unclear, use the rules'
  unintelligible/null marker rather than guessing.
- Never let content leak between captions (e.g. do not put visual info in the audio caption).
- Timestamps in seconds, within the video range.

Return ONLY a valid JSON object of the exact shape:
{
  "speech": [ { "startTime": 0.0, "endTime": 3.5, "${tracks.speech.captions[0].id}": "...", "${tracks.speech.captions[1].id}": "..." } ],
  "av": [ { "startTime": 0.0, "endTime": 6.0, "${tracks.av.captions[0].id}": "...", "${tracks.av.captions[1].id}": "..." } ]
}
Do not wrap in markdown or add any text outside the JSON.`.trim();
}

/**
 * Segment-level cell regeneration (one caption of one annotation).
 */
export async function regenerateSegmentCell(
  startSec: number,
  endSec: number,
  columnId: string,
  columnName: string,
  existingValue: string,
  userInstruction: string,
  rulesSpecJson: string,
  usePro: boolean
): Promise<string> {
  if (isSimulationMode()) {
    await delay(1000);
    return userInstruction.trim()
      ? `[${columnName} update: applied '${userInstruction}' for ${startSec}s-${endSec}s]`
      : `Revised ${columnName} text based on constraints.`;
  }

  const prompt = `
Regenerate the annotation caption for the video segment [${startSec}s - ${endSec}s].
Caption: "${columnName}" (id: ${columnId})
Current Value: "${existingValue}"
Rules Spec:
${rulesSpecJson}

Correction / Focus Instruction:
${userInstruction}

Rewrite the content for this caption to strictly respect the rules and the correction.
Return ONLY the new string content — no quotes, no explanation, no JSON.`.trim();

  try {
    return await callGemini(modelFor(usePro), prompt, 0.3, false);
  } catch (e) {
    console.error('Cell regeneration failed:', e);
    return `${existingValue} (Regen failed: ${(e as Error).message})`;
  }
}

/**
 * Linting: validate one annotation's two captions against the rules spec.
 * Returns a JSON object mapping captionId -> warning string.
 */
export async function lintSegment(
  startSec: number,
  endSec: number,
  captionsJson: string,
  rulesSpecJson: string,
  usePro: boolean
): Promise<string> {
  if (isSimulationMode()) {
    await delay(300);
    return simulateLint(captionsJson);
  }

  const prompt = `
Validate the following annotation captions for the video segment [${startSec}s - ${endSec}s]
against the rules specification.

Rules Specification:
${rulesSpecJson}

Baseline hard rules (ALWAYS enforce, in addition to the rules spec):
${baselineRulesBlock}

Segment Captions:
${captionsJson}

Identify any rule violations per caption (missing required keywords/markers, exceeding
character/word limits, vague phrasing, content leaked into the wrong caption, bad timestamp
format, or any breach of the baseline hard rules — e.g. song lyrics placed in Speech when no
one on screen is singing them). Return ONLY a valid JSON object mapping caption ids to a concise
warning string. If a caption has no violation, omit its key or set it to "". No markdown, no
extra text.`.trim();

  try {
    return await callGemini(modelFor(usePro), prompt, 0.1, true);
  } catch (e) {
    console.error('Linting segment failed:', e);
    return '{}';
  }
}

// --- Internals ----------------------------------------------------------

async function callGemini(
  model: string,
  prompt: string,
  temperature: number,
  forceJson: boolean
): Promise<string> {
  const response = await client().models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature,
      ...(forceJson ? { responseMimeType: 'application/json' } : {}),
    },
  });
  return (response.text ?? '').trim();
}

async function waitForFileActive(
  name: string,
  onProgress: (msg: string) => void
): Promise<{ uri?: string; mimeType?: string; state?: string }> {
  const maxAttempts = 60;
  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    const file = await client().files.get({ name });
    const state = String(file.state ?? 'PROCESSING');
    if (state === 'ACTIVE') {
      onProgress('Video processing finished! Ready for analysis.');
      return file;
    }
    if (state === 'FAILED') throw new Error('File processing failed in Gemini.');
    onProgress(`Processing video in the cloud (attempt ${attempts + 1} of ${maxAttempts})...`);
    await delay(5000);
  }
  throw new Error('Timeout waiting for video processing to complete.');
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function safeParse(json: string): any {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

// --- High-fidelity simulation generators (offline / demo mode) ----------

function simulateRulesSpec(rawText: string): string {
  const t = rawText.toLowerCase();
  const spec: RulesSpec = {
    segmentationRules:
      'Speech is segmented per utterance; Audio/Visual is segmented per scene or distinct sound change. Timestamps in decimal seconds. Each track has its own independent timeline.',
    tracks: {
      speech: {
        ...DEFAULT_TRACKS.speech,
        captions: [
          { ...DEFAULT_TRACKS.speech.captions[0] },
          {
            ...DEFAULT_TRACKS.speech.captions[1],
            description: t.includes('accent')
              ? 'Tone, accent classification, gender, pace, emotion, and stutters.'
              : DEFAULT_TRACKS.speech.captions[1].description,
          },
        ],
      },
      av: { ...DEFAULT_TRACKS.av, captions: [...DEFAULT_TRACKS.av.captions] },
    },
    requiredVocabulary: ['[unintelligible]', '[background noise]', '[music]', 'laughs'],
    hardConstraints: [
      'Keep each segment within 1.0 to 10.0 seconds.',
      "Use exact null marker '[unintelligible]' when speech is unclear.",
      'Never mix visual actions into the Audio caption.',
    ],
    commonMistakes: [
      'Aligning speech and A/V boundaries when they should be independent.',
      'Omitting on-screen text in the Visual caption.',
    ],
  };
  return JSON.stringify(spec);
}

function simulateAnnotations(rulesSpecJson: string): string {
  const tracks = getTracks(rulesSpecJson);
  const [sT, sC] = tracks.speech.captions;
  const [aud, vis] = tracks.av.captions;

  const speechLines = [
    ["Alright, let's look at this screen, which is... uh... showing the dashboard.", 'Male voice, casual pace, slight hesitation with filler.'],
    ["I'll click the 'Generate' button. It should, you know, take a few seconds.", 'Male voice, upbeat, mild filler usage.'],
    ['Wow! It generated a full set of rules from our uploaded PDF.', 'Male voice, excited, rising intonation.'],
    ['The segments align perfectly with the audio playhead.', 'Male voice, calm, measured.'],
    ["Let's export this — copy a cell or download the whole CSV.", 'Male voice, concluding tone.'],
  ];
  const avLines = [
    ['[soft ambient background music]', 'Wide shot of the UI dashboard. Cursor moves toward center.'],
    ['[mouse clicking]', "Close-up of the 'Generate' button with a subtle glow animation."],
    ['[keyboard typing clicks]', "Split screen: parsed rules checklist beside a video preview card."],
    ['[system ding alert]', 'Scrolling the annotated timeline; rows highlight as the playhead passes.'],
  ];

  const speech = speechLines.map((line, i) => ({
    startTime: i * 3.0,
    endTime: i * 3.0 + 3.0,
    [sT.id]: line[0],
    [sC.id]: line[1],
  }));
  const av = avLines.map((line, i) => ({
    startTime: i * 5.0,
    endTime: i * 5.0 + 5.0,
    [aud.id]: line[0],
    [vis.id]: line[1],
  }));

  return JSON.stringify({ speech, av });
}

function simulateLint(captionsJson: string): string {
  const caps = safeParse(captionsJson);
  const result: Record<string, string> = {};
  for (const id of Object.keys(caps)) {
    const val = String(caps[id] ?? '');
    const key = id.toLowerCase();
    if (key.includes('transcription') && (val.includes('uh') || val.includes('you know'))) {
      result[id] = "Contains filler ('uh' / 'you know'). Check if rules permit colloquial speech.";
    } else if (
      key.includes('visual') &&
      !/shot|screen|cursor|close-up|wide/i.test(val)
    ) {
      result[id] = "Vague visual: include a camera shot angle (e.g. 'Close-up', 'Wide shot').";
    }
  }
  return JSON.stringify(result);
}
