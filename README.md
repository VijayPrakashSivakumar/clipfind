# ClipFind

**ClipFind** is a Manifest V3 Chrome extension that turns YouTube videos into actionable discoveries: products, tools, books, software, and other resources mentioned or shown in a video—without watching the whole thing.

> **Status:** Phase 1 (Functional MVP) implemented and tested. Phases 2–4 (AI transcript analysis, visual recognition, production hardening) are roadmap items.

## What Phase 1 does

On any YouTube watch/shorts page, ClipFind adds a side panel with:

* **"Find Everything" button** — kicks off analysis of the current video.
* **Description-link extraction** — collects creator-provided links from the video description (anchors + plain-text URLs) and categorizes them (Products, Tools & AI, Resources, Social, Other).
* **Transcript retrieval** — fetches available captions via YouTube's timedtext endpoint (client-side, with an optional backend proxy). Gracefully degrades when a video has no captions.
* **Keyword-based discovery** — detects product/tool/book mentions in the description and transcript, associates them with timestamps, and assigns an honest match status:
  * `Exact Match` — creator link + mentioned in transcript
  * `Likely Match` — creator link, or URL mentioned in transcript
  * `Search Suggested` — no verified link; a Google search link is offered
* **Discovery cards** — item name, category, timestamp, evidence/context, match badge, and **Jump to Video** / **Copy Link** / **Open** actions.
* **Tabs & search** — All / Products / Tools & AI / Resources / Creator Links, plus a search box.
* **Empty & error states** — clear messages when nothing is found or analysis fails.
* **SPA navigation** — re-analyzes automatically when YouTube navigates between videos without a reload.
* **Extension popup** — current video title/status and recent discoveries (optional local history).
* **Local persistence** — discoveries are saved to `chrome.storage.local` per video (no accounts, no server storage).

## What Phase 1 deliberately does NOT do (honest by design)

* ❌ No fabricated product images, prices, ratings, or confidence scores.
* ❌ No claim that a link is "official" unless it came straight from the creator.
* ❌ No AI transcript analysis (Phase 2). Mentions are found by keyword matching.
* ❌ No visual/frame recognition (Phase 3).
* ❌ No user accounts, sync, or selling of data (Phase 4 privacy scope).

## Project structure

```
clipfind/
├── manifest.json            # Manifest V3 configuration
├── package.json             # Node metadata + test script ("npm test")
├── README.md
├── styles.css               # Base panel stylesheet (runtime theming in ui.js)
├── background.js            # Service worker (coordination + messaging)
├── content.js               # Content script entrypoint (ES module) — orchestrator
├── popup.html / popup.js / popup.css   # Extension toolbar popup
├── icons/                   # Extension icons (SVG)
├── modules/                 # Frontend modules (ES modules)
│   ├── messaging.js         # chrome.runtime/tabs messaging helpers
│   ├── youtube.js           # Video ID, metadata, SPA navigation detection
│   ├── description.js       # Description-link extraction & categorization
│   ├── transcript.js        # Transcript retrieval (timedtext, backend + client)
│   ├── discovery.js         # Product/tool detection, dedup, search links
│   └── ui.js                # Discovery panel UI (tabs, search, cards, seek)
├── tests/
│   └── core.test.mjs        # Unit tests for pure logic (run with "npm test")
└── backend/                 # Optional lightweight backend (Express)
    ├── server.js            # /api/health, /api/transcript proxy
    ├── package.json
    └── .env.example         # Copy to .env; never commit real secrets
```

## Installation (load unpacked)

1. Open Chrome and go to `chrome://extensions/`.
2. Turn on **Developer mode** (toggle, top right).
3. Click **Load unpacked** and select the `clipfind` folder.
4. Open a YouTube video (e.g. `https://www.youtube.com/watch?v=...`).
5. The **ClipFind** panel appears on the right side. Click **Find Everything**.

To use the toolbar popup, click the ClipFind extension icon.

## Optional backend (transcript proxy + future AI)

The frontend tries YouTube's timedtext endpoint directly (same-origin from the content script). A backend proxy is useful for CORS-free, reliable transcript fetching and is required for Phase 2 AI analysis.

```bash
cd backend
cp .env.example .env        # fill in values; never commit real keys
npm install
npm start                   # http://localhost:4000
```

Endpoints:
* `GET /api/health`
* `GET /api/transcript?videoId=<id>&lang=<lang>`

The content script defaults to `http://localhost:4000`. Override by setting `window.__CLIPFIND_BACKEND` before the content script runs, or point the frontend at your deployed backend.

## Permissions & privacy

* **`host_permissions: https://www.youtube.com/*`** — only YouTube pages.
* **`storage`** — local discovery cache (optional, clearable).
* **`tabs`** — popup tab info.
* No API keys are stored in extension code. Any AI/backend keys live server-side only (`.env`, never committed).
* No passwords, unrelated browsing history, or personal information is collected.
* Local history is optional and stored only in `chrome.storage.local`.

## Testing

```bash
npm test
```

Runs unit tests for YouTube URL parsing, description-link extraction, categorization, discovery/dedup, and time formatting.

## Limitations (Phase 1)

* Transcripts are only available for videos that have captions; videos without captions show a graceful message and still analyze description links.
* Product detection is keyword-based (Phase 2 adds AI transcript analysis).
* No visual recognition (Phase 3).
* The backend is optional; without it, transcript fetch uses the client-side timedtext endpoint.

## Roadmap (Phases 2–4)

* **Phase 2 — Intelligent Discovery:** full-transcript AI analysis, recommendation extraction, official URL resolution, deduplication, confidence labels.
* **Phase 3 — Visual Intelligence:** on-demand frame analysis, on-screen product/software detection, timestamp association.
* **Phase 4 — Production Readiness:** settings/privacy controls, accessibility, automated E2E tests, Chrome Web Store validation, deployment docs.

## Phase 2 — Intelligent Discovery (Backend AI)

Phase 2 adds AI-powered transcript analysis via a lightweight Express backend. The extension sends the video transcript to `POST /api/analyze`, which uses an LLM (OpenAI by default) to extract product/tool/book recommendations with evidence, confidence, and match status.

### Backend setup

```bash
cd backend
cp .env.example .env
# Add your OpenAI API key to .env
npm install
npm start
```

Endpoints:
* `GET /api/health`
* `GET /api/transcript?videoId=&lang=` — caption proxy
* `POST /api/analyze` — AI transcript analysis `{ videoId, transcript, title?, channel? }`

### Environment variables (backend only, never in extension)

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | OpenAI API key for transcript analysis |
| `CLIPFIND_AI_MODEL` | Model to use (default: `gpt-4o-mini`) |
| `CLIPFIND_BACKEND_URL` | Backend URL the extension calls (default: `http://localhost:4000`) |

### Graceful fallback

If the backend is not running or no API key is configured, ClipFind falls back to Phase 1 keyword-based discovery. The panel still works — it just won't have AI-extracted recommendations.

### What Phase 2 adds

* Full-transcript AI analysis (not just keyword matching)
* Extracted recommendations with supporting evidence from the transcript
* Confidence levels (`high` / `medium` / `low`) and match status
* AI discoveries merged with description-link and keyword discoveries
* Deduplication across all sources

## Phase 3 — Visual Intelligence

Phase 3 adds on-demand visual recognition of products, tools, books, and software shown on screen in YouTube videos. The extension captures video frames at key intervals and sends them to a vision AI model (OpenAI GPT-4o-mini by default) running server-side.

### How it works

1. User clicks **"Scan Visuals"** in the ClipFind panel.
2. The extension captures up to 10 frames at intervals across the video duration.
3. Each frame is sent to `POST /api/analyze-frame` on the backend.
4. The backend vision service identifies visible items and returns them with:
   - Item name and category
   - Evidence (what's visible in the frame)
   - Confidence level (`high` / `medium` / `low`)
   - Match status (`Exact Match` / `Likely Match` / `Visual Similar`)
   - Timestamp where the item appears
   - Frame thumbnail preview
5. Visual discoveries are merged with text-based discoveries and displayed in the panel.

### What Phase 3 adds

* On-demand frame capture (not continuous — only when user clicks "Scan Visuals")
* Up to 10 key frames scanned per video
* Visual discovery cards with frame thumbnails
* Timestamp association for each visual discovery
* Distinction between exact matches, likely matches, and visually similar items
* No fabricated images, prices, or ratings

### Backend endpoints (Phase 3)

* `POST /api/analyze-frame` — `{ videoId, timestamp, imageBase64 }` → visual discoveries

### Graceful fallback

If the backend is not running or no OpenAI API key is configured, visual scanning returns empty and the extension continues to work with text-based discovery only.

## Disclaimer

ClipFind does not bypass YouTube access controls, authentication, or anti-bot protections. It only reads publicly rendered page content and captions made available by YouTube. Always respect YouTube's Terms of Service and third-party rights.
