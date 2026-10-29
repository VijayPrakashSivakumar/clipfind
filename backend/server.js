/**
 * ClipFind backend (Express).
 *
 * Provides server-side endpoints the extension calls:
 *   GET /api/health
 *   GET /api/transcript?videoId=&lang=
 *
 * The transcript endpoint fetches captions from YouTube's timedtext endpoint
 * server-side so the extension does not need to handle CORS or expose any
 * secrets. No API keys are required for captions; AI analysis (Phase 2+) can
 * be added here using keys stored only server-side.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const analysisRouter = require('./routes/analysis');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'clipfind-backend' });
});

app.use('/api', analysisRouter);

/**
 * Proxy for YouTube timedtext captions.
 * Tries a few language/format variants and returns parsed segments.
 */
app.get('/api/transcript', async (req, res) => {
  const { videoId, lang = 'en' } = req.query;
  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'videoId is required' });
  }

  const attempts = [
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(lang)}&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=en-US&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&fmt=json3`,
  ];

  let lastErr = null;
  for (const url of attempts) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'Accept-Language': 'en-US,en;q=0.9' },
      });
      if (!response.ok) {
        lastErr = new Error(`timedtext HTTP ${response.status}`);
        continue;
      }
      const text = await response.text();
      const segments = parseTimedtext(text);
      if (segments.length) {
        return res.json({ videoId, lang, segments, source: 'youtube-timedtext' });
      }
    } catch (err) {
      lastErr = err;
    }
  }

  return res.status(404).json({
    error: lastErr ? lastErr.message : 'No captions/transcript available for this video.',
    videoId,
  });
});

function parseTimedtext(text) {
  const segments = [];
  if (!text) return segments;
  // YouTube timedtext JSON3: { events: [{ tStartMs, durMs, segs: [{ utf8 }] }] }
  try {
    const data = JSON.parse(text);
    if (data && Array.isArray(data.events)) {
      for (const ev of data.events) {
        const start = Number(ev.tStartMs || 0) / 1000;
        const dur = Number(ev.durMs || 0) / 1000;
        const tx = (ev.segs || []).map((sg) => sg.utf8 || '').join('').trim();
        if (tx) segments.push({ start, end: start + dur, text: tx });
      }
      return segments;
    }
  } catch {
    // Not JSON; try TTML XML below.
  }
  try {
    const parser = new DOMParser();
    // DOMParser may not be available in Node < 18.x without a polyfill; guard.
    if (typeof DOMParser === 'undefined') return segments;
    const doc = parser.parseFromString(text, 'application/xml');
    const nodes = doc.querySelectorAll('body > div, body > p, tt > body > div, tt > body > p');
    for (const el of nodes) {
      const start = Number(el.getAttribute('begin') || 0);
      const dur = Number(el.getAttribute('dur') || 0);
      const tx = el.textContent.trim();
      if (tx) segments.push({ start, end: start + dur, text: tx });
    }
  } catch {
    // ignore parse errors
  }
  return segments;
}

app.listen(PORT, () => {
  console.log(`[ClipFind backend] listening on http://localhost:${PORT}`);
});

module.exports = app;
