/**
 * ClipFind — Transcript retrieval.
 *
 * Retrieves captions/transcript for a YouTube video using permitted methods.
 * Preference order:
 *  1. Backend proxy (/api/transcript) — server-side fetch of YouTube timedtext,
 *     avoids CORS and keeps future AI handling server-side.
 *  2. Client-side fallback to YouTube timedtext endpoint (same-origin from content script).
 *
 * Returns segments: [{ start, end, text }]. Empty array with no error means
 * no transcript is available (graceful degradation, never fabricated).
 */

const BACKEND_BASE = 'http://localhost:4000'; // set via window.__CLIPFIND_BACKEND if deployed

export class TranscriptClient {
  constructor(backendBase) {
    this.backendBase = backendBase || (window.__CLIPFIND_BACKEND || BACKEND_BASE);
  }

  async fetch(videoId, lang = 'en') {
    let segments = [];
    let error = null;
    let source = 'none';

    // Try backend proxy first.
    try {
      const backendSegments = await this.fetchFromBackend(videoId, lang);
      if (backendSegments && backendSegments.length) {
        return { segments: backendSegments, source: 'backend', error: null };
      }
    } catch (err) {
      error = err.message;
    }

    // Client-side timedtext fallback (same-origin when running on youtube.com).
    try {
      const clientSegments = await this.fetchTimedtext(videoId, lang);
      if (clientSegments && clientSegments.length) {
        return { segments: clientSegments, source: 'client', error: null };
      }
    } catch (err) {
      if (!error) error = err.message;
    }

    return { segments, source, error: error || 'No transcript available for this video.' };
  }

  async fetchFromBackend(videoId, lang) {
    const url = `${this.backendBase}/api/transcript?videoId=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(lang)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Backend responded ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.segments)) return [];
    return data.segments.map((s) => ({
      start: Number(s.start || 0),
      end: Number(s.end || s.start || 0),
      text: String(s.text || ''),
    }));
  }

  async fetchTimedtext(videoId, lang) {
    // Try several common caption formats/languages.
    const attempts = [
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-US&fmt=json3`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=json3`,
    ];
    let lastErr = null;
    for (const url of attempts) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
        const text = await res.text();
        const segments = this.parseTimedtext(text);
        if (segments.length) return segments;
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr) throw lastErr;
    return [];
  }

  parseTimedtext(text) {
    const segments = [];
    if (!text) return segments;
    // YouTube timedtext JSON3 format looks like: { events: [{ tStartMs, durMs, segs: [{ utf8 }] }] }
    try {
      const data = JSON.parse(text);
      if (data && Array.isArray(data.events)) {
        for (const ev of data.events) {
          const start = Number(ev.tStartMs || 0) / 1000;
          const dur = Number(ev.durMs || 0) / 1000;
          const textParts = (ev.segs || []).map((sg) => sg.utf8 || '').join('');
          if (textParts.trim()) {
            segments.push({ start, end: start + dur, text: textParts });
          }
        }
        return segments;
      }
    } catch {
      // Not JSON; fall through to XML parse.
    }
    // Minimal XML (TTML) fallback.
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'application/xml');
      const bodies = doc.querySelectorAll('body > div, body > p, tt > body > div, tt > body > p');
      for (const el of bodies) {
        const start = Number(el.getAttribute('begin') || 0);
        const dur = Number(el.getAttribute('dur') || 0);
        const tx = el.textContent.trim();
        if (tx) segments.push({ start, end: start + dur, text: tx });
      }
      return segments;
    } catch {
      return segments;
    }
  }
}

export const transcriptClient = new TranscriptClient();
