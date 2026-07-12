// Small shared helpers.

/** How timestamps are displayed across the workspace. */
export type TimeFormat = 'mmss' | 'seconds';

/** Format milliseconds as MM:SS.S (matches the original Android formatter). */
export function formatTimeMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(ms / 60000);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(1).padStart(4, '0')}`;
}

/** Format milliseconds in the chosen display format: MM:SS.S or plain seconds. */
export function formatTime(ms: number, format: TimeFormat): string {
  if (format === 'seconds') return `${(ms / 1000).toFixed(1)}s`;
  return formatTimeMs(ms);
}

/** Strip ```json fences that models sometimes wrap responses in. */
export function cleanJsonString(raw: string): string {
  let str = raw.trim();
  if (str.startsWith('```json')) str = str.slice('```json'.length);
  else if (str.startsWith('```')) str = str.slice(3);
  if (str.endsWith('```')) str = str.slice(0, -3);
  return str.trim();
}

/**
 * Parse a duration entered as "MM:SS.S" (or "H:MM:SS.S") or plain seconds
 * ("307.75") into seconds. Returns null if unparseable/empty.
 */
export function parseTimeInput(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (t.includes(':')) {
    const parts = t.split(':').map((p) => Number(p));
    if (parts.some((n) => isNaN(n) || n < 0)) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  const n = Number(t);
  return isNaN(n) || n < 0 ? null : n;
}

export function safeParseObject(json: string): Record<string, any> {
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/**
 * Attempt to repair truncated/incomplete JSON by cutting back to the last
 * completed array/object element and closing any still-open brackets. Returns
 * null if it can't find a safe truncation point. Used to salvage partial
 * annotation responses when the model output is cut off mid-JSON.
 */
export function repairJson(input: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let cut = -1;
  let closers = '';

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
    } else if (c === '{') {
      stack.push('}');
    } else if (c === '[') {
      stack.push(']');
    } else if (c === '}' || c === ']') {
      stack.pop();
      cut = i; // an element just completed
      closers = [...stack].reverse().join('');
    } else if (c === ',' && stack[stack.length - 1] === ']') {
      // Only cut at array-element commas; a comma inside an object would leave a
      // partial (missing-field) object, so we ignore those.
      cut = i - 1;
      closers = [...stack].reverse().join('');
    }
  }

  if (cut < 0) return null;
  const head = input.slice(0, cut + 1).replace(/[,\s]*$/, '');
  return head + closers;
}

/**
 * Parse JSON, salvaging as much as possible from truncated/invalid output.
 * Returns { value, repaired }. Throws only if nothing can be recovered.
 */
export function parseJsonLoose(text: string): { value: any; repaired: boolean } {
  try {
    return { value: JSON.parse(text), repaired: false };
  } catch (firstErr) {
    const repaired = repairJson(text);
    if (repaired) {
      try {
        return { value: JSON.parse(repaired), repaired: true };
      } catch {
        /* fall through */
      }
    }
    throw firstErr;
  }
}

export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for insecure contexts
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

/** Trigger a browser download for a text payload. */
export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
