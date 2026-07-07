// Gemini service for the Annotation Workbench web app.
// Ported from the Android GeminiClient. Uses the official @google/genai SDK and
// runs entirely in the browser with a user-supplied API key. When no key is
// present it falls back to high-fidelity simulation so the app is fully usable
// offline / for demos.

import { GoogleGenAI } from '@google/genai';
import type { RulesSpec } from '../types';

// Real, currently-available Gemini models.
const FLASH_MODEL = 'gemini-2.5-flash';
const PRO_MODEL = 'gemini-2.5-pro';

export const MODEL_LABELS = {
  fast: 'Gemini 2.5 Flash',
  pro: 'Gemini 2.5 Pro',
};

let runtimeApiKey = '';

/** Set the runtime key (from the settings UI). */
export function setApiKey(key: string): void {
  runtimeApiKey = (key ?? '').trim();
}

/** Effective key = runtime UI key, else a build-time env key. */
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
 * Step 1: Parse and summarize the raw rules document text into a structured spec.
 */
export async function parseRulesSpec(rulesText: string, usePro: boolean): Promise<string> {
  if (isSimulationMode()) return simulateRulesSpec(rulesText);

  const prompt = `
Summarize this annotation rules document into a structured JSON specification.
The JSON MUST have the following fields:
1. "segmentationRules": a string describing how the video should be segmented (e.g. "Every scene change", "Fixed 5-second intervals", "Continuous conversation blocks") and the required timestamp format (e.g., "MM:SS.S" or "seconds").
2. "columns": an array of objects. Each object represents an annotation lane/caption field requested. It must have:
   - "id": a short camelCase ID (e.g., "transcription", "audioCharacteristics", "visualDescription")
   - "name": the title of the column (e.g., "Transcription", "Speech Characteristics", "Visual", "Audio")
   - "description": what belongs in this lane according to the rules.
   - "required": boolean
3. "requiredVocabulary": an array of exact required strings or keywords (e.g., ["unintelligible", "camera", "accent", "cough"]).
4. "hardConstraints": an array of strings outlining word limits, character counts, or forbidden content.
5. "commonMistakes": an array of strings warning about common errors from the rules.

Rules document text:
${rulesText}

Return ONLY a valid JSON object matching the schema above. Do not include markdown code blocks or any explanation outside the JSON.`.trim();

  try {
    return await callGemini(modelFor(usePro), prompt, 0.2, true);
  } catch (e) {
    console.error('Failed to parse rules spec via Gemini:', e);
    return simulateRulesSpec(rulesText);
  }
}

/**
 * Step 2: Generate dynamic annotations for a video based on a rules spec.
 * Uploads the video via the Gemini Files API, waits for it to become ACTIVE,
 * then requests structured segment annotations. Falls back to inline base64.
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
    onProgress('Processing segment draft...');
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

  const spec = safeParse(rulesSpecJson);
  const columns: any[] = Array.isArray(spec.columns) ? spec.columns : [];
  const columnKeys = columns.map((c) => c.id);
  const colDescriptions = columns
    .map((c) => `- ${c.name} (${c.id}): ${c.description ?? ''}`)
    .join('\n');
  const columnsListStr = columnKeys.map((k) => `"${k}": "string content"`).join(', ');

  const systemPrompt = `
You are a professional video annotator. Your job is to output a structured caption/annotation file for the uploaded video following the provided rules specification strictly.

Annotation lanes to fill for each segment:
${colDescriptions}

Rules Guidelines:
${rulesSpecJson}

Generate continuous contiguous segments covering the video timeline from beginning to end.
Return a JSON array of segment objects. Each segment object MUST have:
- "startTime": double representing the start of the segment in seconds (e.g. 0.0)
- "endTime": double representing the end of the segment in seconds (e.g. 4.5)
${columnsListStr}

Precision instructions:
- Only describe what is directly evidenced in the video. If speech is unclear, use the rules' unintelligible marker rather than guessing.
- Use the exact timestamp format and exact null-marker strings from the rules verbatim.
- Never let content leak between lanes (e.g. do not put audio description in the visual description lane).
- Timestamps must fall within the video range.

Return ONLY a valid JSON array of objects. Do not wrap in markdown or any other text.`.trim();

  onProgress('Analyzing video segment details...');
  try {
    const response = await client().models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { fileUri, mimeType: fileMime } },
            { text: 'Please annotate this entire video according to the instructions.' },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        temperature: 0.2,
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

  const systemPrompt = `
Analyze this video and produce structured annotation segments.
Guidelines:
${rulesSpecJson}

Return a valid JSON array of segment objects. Each segment object MUST have:
- "startTime": double (seconds)
- "endTime": double (seconds)
And the specific caption fields outlined in the guidelines.`.trim();

  const response = await client().models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64Video } },
          { text: 'Annotate this video.' },
        ],
      },
    ],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });
  return response.text ?? '[]';
}

/**
 * Segment-level cell regeneration.
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
      ? `[${columnName} Segment Update: Applied custom instruction '${userInstruction}'. Segment: ${startSec} - ${endSec}]`
      : `Revised ${columnName} text based on constraints.`;
  }

  const prompt = `
Regenerate the annotation cell for the video segment [${startSec}s - ${endSec}s].
Column Lane: "${columnName}" (id: ${columnId})
Current Value: "${existingValue}"
Rules Spec:
${rulesSpecJson}

Correction / Focus Instruction:
${userInstruction}

Please rewrite the content for this specific lane to strictly respect the rules document and correction instruction.
Return ONLY the new string content. Do not include quotes, explanation, or JSON structures. Just the raw string value of the caption cell.`.trim();

  try {
    return await callGemini(modelFor(usePro), prompt, 0.3, false);
  } catch (e) {
    console.error('Cell regeneration failed:', e);
    return `${existingValue} (Regen failed: ${(e as Error).message})`;
  }
}

/**
 * Linting: validate a segment against the rules spec and flag violations.
 * Returns a JSON object mapping columnIds to a warning string.
 */
export async function lintSegment(
  startSec: number,
  endSec: number,
  captionsJson: string,
  rulesSpecJson: string,
  usePro: boolean
): Promise<string> {
  if (isSimulationMode()) {
    await delay(400);
    return simulateLint(captionsJson, rulesSpecJson);
  }

  const prompt = `
Validate the following annotation captions for video segment [${startSec}s - ${endSec}s] against the rules specification.

Rules Specification:
${rulesSpecJson}

Segment Captions:
${captionsJson}

Your job is to identify any rule violations for each caption lane. Examples of violations:
- Missing required keywords (e.g. "accent" if speech is foreign, or exact null markers).
- Exceeding character/word constraints.
- Vague phrases, content leaked between wrong sensory lanes.
- Non-compliant timestamp formatting.

Return ONLY a valid JSON object mapping caption ids to a concise string warning message. If there is NO violation for a field, omit its key or assign an empty string "".
Example output format:
{
   "transcription": "Exceeds word limit constraint of 15 words",
   "speechCharacteristics": "Missing required accent classification"
}
Do not include markdown tags, code blocks, or any introductory text. Return only the raw JSON.`.trim();

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
  const maxAttempts = 60; // 60 * 5s = 5 min max
  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    const file = await client().files.get({ name });
    const state = String(file.state ?? 'PROCESSING');
    if (state === 'ACTIVE') {
      onProgress('Video processing finished! Ready for analysis.');
      return file;
    }
    if (state === 'FAILED') {
      throw new Error('File processing failed in Gemini.');
    }
    onProgress(`Processing video in the cloud (attempt ${attempts + 1} of ${maxAttempts})...`);
    await delay(5000);
  }
  throw new Error('Timeout waiting for video processing to complete.');
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
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
  const textLower = rawText.toLowerCase();
  const columns: RulesSpec['columns'] = [
    {
      id: 'transcription',
      name: 'Transcription',
      description:
        'Verbatim text including stutters/fillers as required. Enclose uncertain words in brackets.',
      required: true,
    },
  ];

  if (textLower.includes('visual') || textLower.includes('video') || textLower.includes('camera')) {
    columns.push({
      id: 'visualDescription',
      name: 'Visual/Camera',
      description:
        "Describe on-screen characters, camera moves, and context. Mark text in single quotes.",
      required: true,
    });
  } else {
    columns.push({
      id: 'speechCharacteristics',
      name: 'Speech Characteristics',
      description: 'Tone, accents, gender, pace, and stutters.',
      required: false,
    });
  }

  columns.push({
    id: 'audioEffects',
    name: 'Audio/SFX',
    description:
      'Non-speech audio sounds (cough, laugh, background noise). Use [brackets] for effects.',
    required: true,
  });

  const spec: RulesSpec = {
    segmentationRules:
      'Every conversational utterance or distinct screen change, formatted as standard decimal seconds (e.g., 0.0 to 3.5).',
    columns,
    requiredVocabulary: ['[unintelligible]', '[background noise]', '[music]', 'laughs', 'stutters'],
    hardConstraints: [
      'Keep segment length within 1.0 to 10.0 seconds.',
      'Always include verbatim speech transcriptions.',
      "Use exact null marker '[unintelligible]' when audio is unclear.",
    ],
    commonMistakes: [
      'Mixing visual actions into the audio effects column.',
      'Omitting speaker labels in conversation blocks.',
    ],
  };
  return JSON.stringify(spec);
}

function simulateAnnotations(rulesSpecJson: string): string {
  const spec = safeParse(rulesSpecJson);
  const columns: any[] = Array.isArray(spec.columns) ? spec.columns : [];

  const sampleTranscriptions = [
    "Alright, let's look at this screen, which is... uh... showing the dashboard.",
    "I will click on the 'Generate' button right here. It should, you know, take a few seconds.",
    'Wow! Look at that, it generated a full set of rules from our uploaded PDF file.',
    'This is incredible. The segments are perfectly aligned with the audio playhead.',
    'Let\'s export this. We can copy each individual cell or download everything as CSV.',
  ];
  const sampleVisuals = [
    'Wide shot of the user interface dashboard. Cursor moves towards the center.',
    "Close-up of the 'Generate' button glowing with a subtle breathing light animation.",
    'Split screen showing the parsed rules document checklist alongside a video preview card.',
    'Scrolling down the list of annotated timeline rows, each highlighting as playhead passes.',
    'Cursor hovering over the CSV and JSON export options in the toolbar.',
  ];
  const sampleAudios = [
    '[clicking mouse sound]',
    '[keyboard typing clicks]',
    '[sigh of satisfaction]',
    '[subtle background ambient music playing]',
    '[system ding alert]',
  ];

  const segmentDuration = 4.0;
  const segments: any[] = [];
  for (let i = 0; i < 5; i++) {
    const start = i * segmentDuration;
    const seg: any = { startTime: start, endTime: start + segmentDuration };
    for (const col of columns) {
      const id: string = col.id;
      if (id.includes('trans')) seg[id] = sampleTranscriptions[i];
      else if (id.includes('vis')) seg[id] = sampleVisuals[i];
      else if (id.includes('aud') || id.includes('sfx')) seg[id] = sampleAudios[i];
      else seg[id] = 'Complies with rule guidelines. [Null marker applied]';
    }
    segments.push(seg);
  }
  return JSON.stringify(segments);
}

function simulateLint(captionsJson: string, rulesSpecJson: string): string {
  const captions = safeParse(captionsJson);
  const spec = safeParse(rulesSpecJson);
  const columns: any[] = Array.isArray(spec.columns) ? spec.columns : [];
  const result: Record<string, string> = {};

  for (const col of columns) {
    const id: string = col.id;
    const val: string = String(captions[id] ?? '');
    if (id.includes('trans') && (val.includes('uh') || val.includes('you know'))) {
      result[id] =
        "Rule warning: Contains filler phrase ('uh' / 'you know'). Check if rules permit colloquial speech.";
    } else if (
      id.includes('vis') &&
      !val.includes('shot') &&
      !val.includes('screen') &&
      !val.includes('Cursor')
    ) {
      result[id] =
        "Vague visual description: Include camera shot angle (e.g., 'Close-up' or 'Wide shot').";
    }
  }
  return JSON.stringify(result);
}
