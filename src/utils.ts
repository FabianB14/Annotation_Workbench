// Small shared helpers.

/** Format milliseconds as MM:SS.S (matches the original Android formatter). */
export function formatTimeMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(ms / 60000);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(1).padStart(4, '0')}`;
}

/** Strip ```json fences that models sometimes wrap responses in. */
export function cleanJsonString(raw: string): string {
  let str = raw.trim();
  if (str.startsWith('```json')) str = str.slice('```json'.length);
  else if (str.startsWith('```')) str = str.slice(3);
  if (str.endsWith('```')) str = str.slice(0, -3);
  return str.trim();
}

export function safeParseObject(json: string): Record<string, any> {
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
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
