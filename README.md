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
- **Playback-speed normalization ("Speed Correction"):** If your recording was captured at non-1× (e.g. a 2× screen recording), tell the app the capture speed — or paste the source video's true duration and it **auto-detects** the speed (`source ÷ recording`). A blocking modal warns you if the detected speed disagrees with your selection by >5%. All timestamps then land on the real source timeline: the player plays the recording back at true 1×, and every exported time is corrected. Duration validation hard-stops a recording whose corrected length doesn't match the source (non-uniform/variable playback), and every export carries a QA line (`normalization: S=2.00, source=…, corrected=…, status=OK`). See [Speed Correction](#speed-correction) below.
- **Model toggle:** Fast Draft (`gemini-2.5-flash`) vs High Accuracy (`gemini-2.5-pro`).
- **Local-first persistence:** Projects & segments in `localStorage`, video blobs in IndexedDB — nothing leaves your browser except the direct calls to the Gemini API.
- **Demo mode:** With no API key set, the app runs a high-fidelity offline simulation so every step is usable without a key.

## Gemini API Key — bring your own

The app calls the Gemini API **directly from the browser with each user's own key** —
there is no shared/server key. This is what makes it safe to host publicly (e.g. on
GitHub Pages): the deployed site ships no secrets, and every visitor supplies their own.

1. Get a free key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).
2. Open the app, click the ⚙️ icon in the top bar, and paste your key.
3. The key is stored **only in your own browser** (`localStorage`) and is sent
   only to Google's Gemini API — never to any other server.

Without a key, the app runs a high-fidelity **demo simulation** so every step is
usable offline.

> _Advanced / self-host only:_ you can pre-fill a key at build time by copying
> `.env.example` to `.env` and setting `GEMINI_API_KEY`. **Do not do this for a
> public deployment** — the key would be embedded in the shipped JavaScript and
> usable by anyone who visits.

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

## Deploy to GitHub Pages

This repo ships a ready-to-use Pages workflow at
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It builds the
site and publishes it on every push to `main`.

**One-time setup:** in the repository, go to **Settings → Pages → Build and
deployment → Source** and select **GitHub Actions**. That's it — the next push to
`main` (or a manual run via the **Actions** tab) deploys the site to:

```
https://<your-username>.github.io/<repo-name>/
```

Notes:
- The workflow sets the Vite `base` path from the repo name automatically, so it
  works for forks and renames without editing config.
- No API key is baked into the build — each visitor enters their own key in the
  app (see above), so the public site ships no secrets.

## Speed Correction

Analysis must run on a 1×-normalized timeline so exported timestamps match the
real source video. On the upload screen:

1. **Capture Speed** dropdown (1× … 2×, or Custom 0.25–4.0) — "the speed the video
   was recorded/played at". This is the manual fallback when auto-detection isn't
   possible (e.g. a hand-made clip with no known source).
2. **Source Duration** (optional, `MM:SS.S` or seconds) — when provided, the app
   computes **detected speed = source ÷ recording** and shows it live.
3. If the detected speed and your selection disagree by >5%, a **blocking modal**
   asks you to pick (default: detected).

The resolved factor **S** is applied at ingest: Gemini analyzes the (possibly
sped-up) recording, and all returned times are mapped to the source timeline
(`t_source = t_recording × S`). The video player runs the recording at `1/S` so it
plays at true 1×, and seeking/scrubbing use source-timeline values. Anything within
±2% of 1× skips correction entirely.

**Validation:** when the source duration is known, the corrected duration must land
within 1s of it or generation hard-stops (a non-uniform/variable-speed recording
can't be fixed by a flat factor — re-record at 1×). Every export includes a QA line,
and an export-time integrity check blocks rows that fall outside a valid timeline.

**Implementation note:** this app is browser-only with no backend and does a single
Gemini analysis pass (one clock), so the correction is applied at that single ingest
boundary and in the player, rather than re-encoding the media. The normalization
logic lives in `src/services/normalization.ts` (including `ffmpegCommand()` /
`atempoChain()` describing the equivalent `setpts`/`atempo` re-encode) so a real
in-browser re-encode (ffmpeg.wasm) can be dropped in later if native-1× ASR quality
on the restored media is needed. Best practice remains **capture at 1×**; this is the
recovery path.

## Tech Stack

- React 18 + TypeScript
- Vite
- [`@google/genai`](https://www.npmjs.com/package/@google/genai) — official Gemini JS SDK
- localStorage + IndexedDB for persistence

> **Security model:** The Gemini key is used entirely client-side and each user
> supplies their own via the ⚙️ dialog (stored only in their browser). The
> deployed site contains no secrets, which is what makes public static hosting
> safe. If you ever bake a key in at build time (`.env`), that key becomes public
> — only do so for private/local use, or put a small backend proxy in front of
> the Gemini API instead.
