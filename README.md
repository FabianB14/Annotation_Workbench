<div align="center">
<h1>🎬 Annotation Workbench</h1>
<p><strong>A web app for AI-assisted video annotation, powered by Google Gemini's multimodal video understanding.</strong></p>
</div>

Annotation Workbench turns raw annotation guidelines + a video into a structured,
reviewable caption file. Gemini parses your rules into a schema, watches the video,
drafts time-coded segment annotations, lints them against your rules, and lets you
regenerate individual cells — all in the browser.

Originally an Android/Jetpack Compose app, now rebuilt as a **React + TypeScript + Vite** web app.

## Features

- **Step 1 — Rules Spec:** Upload or paste annotation guidelines (`.md`, `.txt`, `.pdf`, `.docx`). Gemini synthesizes a structured spec (segmentation rules, sensory caption lanes, required vocabulary, hard constraints). Review and edit the schema before confirming.
- **Step 2 — Ingest Video:** The video is uploaded once via the Gemini Files API, then Gemini generates continuous, time-coded annotation segments across the whole timeline. (Inline base64 fallback for small clips.)
- **Step 3 — Review Studio:** A synced video player + editable annotation table. Seek by clicking timestamps, split/merge/add/delete segments, edit any cell, **AI-lint** all segments against the rules, and **regenerate** individual cells with custom instructions. Export to **CSV**, **JSON**, or copy formatted text.
- **Model toggle:** Fast Draft (`gemini-2.5-flash`) vs High Accuracy (`gemini-2.5-pro`).
- **Local-first persistence:** Projects & segments in `localStorage`, video blobs in IndexedDB — nothing leaves your browser except the direct calls to the Gemini API.
- **Demo mode:** With no API key set, the app runs a high-fidelity offline simulation so every step is usable without a key.

## Gemini API Key

The app calls the Gemini API directly from the browser with **your** key.

**Option A — paste it in the app (recommended):** Click the ⚙️ icon in the top bar and paste your key. It's stored only in your browser's `localStorage`.

**Option B — bake it into the build:** Copy `.env.example` to `.env` and set `GEMINI_API_KEY`.

Get a free key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).

## Run Locally

**Prerequisites:** [Node.js](https://nodejs.org/) 18+

```bash
npm install
npm run dev
```

Then open the printed URL (default http://localhost:5173).

## Build for Production

```bash
npm run build      # outputs static files to dist/
npm run preview    # preview the production build locally
```

The `dist/` folder is a fully static site — deploy it to any static host
(Vercel, Netlify, GitHub Pages, Cloudflare Pages, S3, etc.).

## Tech Stack

- React 18 + TypeScript
- Vite
- [`@google/genai`](https://www.npmjs.com/package/@google/genai) — official Gemini JS SDK
- localStorage + IndexedDB for persistence

> **Security note:** Because the Gemini key is used client-side, anyone with access
> to a deployed instance where you've baked in a key could use it. For a public
> deployment, prefer having each user supply their own key via the ⚙️ dialog, or
> put a small backend proxy in front of the Gemini API.
