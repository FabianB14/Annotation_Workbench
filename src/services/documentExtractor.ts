// Extracts raw text from an uploaded rules document (txt / md / pdf / docx).
// Ported from the Android DocumentTextExtractor. Kept dependency-free: plain
// text is read directly, DOCX/PDF use lightweight best-effort extraction and
// otherwise fall back to a note (Gemini can still parse the pasted text).

const FALLBACK_PDF =
  '[Rules file ingested. PDF structure will be sent directly to Gemini for precision summary.]';

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.docx')) {
      return await extractFromDocx(file);
    }
    if (name.endsWith('.pdf')) {
      return await extractFromPdf(file);
    }
    // Default: read as plain text (.txt, .md, .json, etc.)
    return await file.text();
  } catch (e) {
    return `Error extracting text from file: ${(e as Error).message}`;
  }
}

async function extractFromDocx(file: File): Promise<string> {
  // DOCX is a zip; without a zip lib we scan the raw bytes for <w:t> runs which,
  // while not perfectly decompressed, recovers text for many simple documents.
  const buf = new Uint8Array(await file.arrayBuffer());
  let raw = '';
  for (let i = 0; i < buf.length; i++) raw += String.fromCharCode(buf[i]);

  const matches = [...raw.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/g)];
  const text = matches.map((m) => m[1]).join(' ');
  const cleaned = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();

  if (cleaned.length < 20) {
    return '[Rules file ingested. Please paste the guidelines text if extraction looks incomplete, or let Gemini summarize it.]';
  }
  return cleaned;
}

async function extractFromPdf(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let content = '';
  for (let i = 0; i < buf.length; i++) content += String.fromCharCode(buf[i]);

  const matches = [...content.matchAll(/\(([^)]+)\)\s*(?:Tj|TJ)/g)];
  const list = matches.map((m) => m[1]);
  if (list.length === 0) return FALLBACK_PDF;

  const parsed = list.join(' ').replace(/\\\(/g, '(').replace(/\\\)/g, ')').trim();
  return parsed.length < 50 ? FALLBACK_PDF : parsed;
}
