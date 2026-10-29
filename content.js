/**
 * ClipFind — content script (ES module).
 * Orchestrates the YouTube panel: metadata, description links, transcript,
 * discovery, rendering, timestamp seeking, and SPA navigation handling.
 */
import { getVideoId, extractMetadata, isSupportedPage, onNavigation } from './modules/youtube.js';
import { extractDescriptionLinks, extractPlainTextLinks } from './modules/description.js';
import { transcriptClient } from './modules/transcript.js';
import { discoverFromLinks, discoverFromKeywords, mergeAndDedup, buildSearchUrl } from './modules/discovery.js';
import { ui } from './modules/ui.js';

let currentVideoId = null;
let analysisRunning = false;
let panelBound = false;

const BACKEND_BASE = window.__CLIPFIND_BACKEND || 'http://localhost:4000';

function log(...args) {
  console.log('[ClipFind]', ...args);
}

/**
 * Seek the YouTube player to a timestamp (seconds).
 */
function seekToVideo(seconds) {
  if (seconds == null) return false;
  const video = document.querySelector('video');
  if (video) {
    try {
      video.currentTime = Number(seconds);
      return true;
    } catch {}
  }
  const player = window.ytPlayer || document.querySelector('#movie_player');
  if (player && typeof player.seekTo === 'function') {
    try { player.seekTo(Number(seconds)); return true; } catch {}
  }
  return false;
}

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    return ok;
  }
}

function openLink(url) {
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    log('Could not open link:', url);
  }
}

function storageKey(videoId) {
  return `clipfind:discoveries:${videoId}`;
}

async function saveDiscoveries(videoId, discoveries) {
  try {
    const payload = discoveries.map((d) => ({ ...d, ts: d.discoveredAt || Date.now() }));
    await chrome.storage.local.set({ [storageKey(videoId)]: payload });
  } catch (err) {
    log('Failed to persist discoveries:', err);
  }
}

function mergeLinks(a, b) {
  const map = new Map();
  for (const l of [...a, ...b]) {
    if (!map.has(l.url)) map.set(l.url, l);
  }
  return [...map.values()];
}

/**
 * Capture a YouTube video frame at a given timestamp as a JPEG data URL.
 */
async function captureFrameAt(video, timestamp) {
  return new Promise((resolve, reject) => {
    if (!video) { reject(new Error('No video element')); return; }
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      video.removeEventListener('seeked', onSeeked);
      tryCapture();
    }, 3000);
    function onSeeked() {
      if (timedOut) return;
      clearTimeout(timeout);
      video.removeEventListener('seeked', onSeeked);
      tryCapture();
    }
    function tryCapture() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } catch (err) {
        reject(err);
      }
    }
    video.addEventListener('seeked', onSeeked, { once: true });
    video.currentTime = Number(timestamp);
  });
}


/**
 * Scan key frames across the video for visual product recognition.
 */
async function scanVisuals(videoId, videoElement) {
  const duration = videoElement.duration || 0;
  if (!duration || duration < 10) return [];
  const maxFrames = 10;
  const interval = duration / maxFrames;
  const timestamps = [];
  for (let i = 0; i < maxFrames; i++) {
    timestamps.push(Math.min(i * interval, duration - 1));
  }
  const visualDiscoveries = [];
  for (const ts of timestamps) {
    try {
      const imageBase64 = await captureFrameAt(videoElement, ts);
      const res = await fetch(`${BACKEND_BASE}/api/analyze-frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, timestamp: ts, imageBase64 }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const d of data.discoveries || []) {
        visualDiscoveries.push(d);
      }
    } catch (err) {
      log('Visual scan frame failed:', err.message);
    }
  }
  return visualDiscoveries;
}


/**
 * Send transcript to the backend for AI-powered recommendation extraction.
 */
async function analyzeWithAI(videoId, transcriptText, title, channel) {
  if (!transcriptText || transcriptText.trim().length < 20) {
    return [];
  }
  try {
    const res = await fetch(`${BACKEND_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, transcript: transcriptText, title, channel }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      log('Backend AI analysis responded', res.status);
      return [];
    }
    const data = await res.json();
    return data.discoveries || [];
  } catch (err) {
    log('Backend AI analysis unavailable (falling back to keywords):', err.message);
    return [];
  }
}


async function runAnalysis(videoId) {
  if (!videoId) {
    ui.showError('Could not identify this YouTube video.');
    return;
  }
  if (analysisRunning) return;
  analysisRunning = true;
  currentVideoId = videoId;

  try {
    ui.setRefreshing(true);
    ui.setStatus('Analyzing…');

    const metadata = extractMetadata();
    const descriptionEl = document.querySelector('#description') || document.querySelector('#description-content');

    // 1. Creator-provided links (anchors + plain text).
    const anchorLinks = extractDescriptionLinks(descriptionEl);
    const plainLinks = extractPlainTextLinks(metadata.description || '');
    const allLinks = mergeLinks(anchorLinks, plainLinks);

    // 2. Transcript (graceful fallback when unavailable).
    let segments = [];
    let transcriptError = null;
    try {
      const result = await transcriptClient.fetch(videoId);
      segments = result.segments || [];
      transcriptError = result.error;
      if (transcriptError) ui.setStatus(transcriptError);
    } catch (err) {
      transcriptError = err.message;
      log('Transcript fetch failed:', err);
    }

    const transcriptText = segments.map((s) => s.text).join(' ');

    // 3. AI-powered discovery from full transcript (Phase 2).
    let aiDiscoveries = [];
    if (segments.length) {
      aiDiscoveries = await analyzeWithAI(videoId, transcriptText, metadata.title, metadata.channel);
    }

    // 4. Visual discovery from video frames (Phase 3).
    let visualDiscoveries = [];
    const video = document.querySelector('video');
    if (video) {
      ui.setStatus('Scanning video frames…');
      visualDiscoveries = await scanVisuals(videoId, video);
    }

    // 5. Discoveries from links + keyword hints in text.
    const fromLinks = discoverFromLinks(allLinks, videoId, segments);
    const fromKeywords = discoverFromKeywords(
      `${metadata.title || ''} ${metadata.channel || ''} ${metadata.description || ''} ${transcriptText}`,
      videoId,
      segments
    );

    // 6. Merge all sources and dedupe.
    const discoveries = mergeAndDedup(fromLinks, fromKeywords, aiDiscoveries, visualDiscoveries);

    // 7. Persist + render.
    await saveDiscoveries(videoId, discoveries);
    ui.setItems(discoveries);

    if (discoveries.length === 0) {
      ui.setStatus(transcriptError || 'No discoveries found.');
      ui.showError(
        transcriptError
          ? transcriptError
          : 'No products, tools, or resources detected. Try opening the description and clicking "Find Everything" again.'
      );
    } else {
      ui.setStatus(`${discoveries.length} discovery${discoveries.length !== 1 ? 's' : ''} found`);
    }
  } catch (err) {
    log('Analysis failed:', err);
    ui.showError('Analysis failed: ' + (err && err.message ? err.message : String(err)));
  } finally {
    analysisRunning = false;
    ui.setRefreshing(false);
  }
}


function bindPanel() {
  if (panelBound) return;
  panelBound = true;
  ui.onRefresh = () => runAnalysis(currentVideoId || getVideoId());
  ui.onJumpTo = (seconds, videoId) => {
    seekToVideo(seconds);
    if (!document.getElementById('clipfind-panel')) ui.createPanel();
  };
  ui.onCopyLink = async (url) => {
    const ok = await copyLink(url);
    ui.setStatus(ok ? 'Link copied.' : 'Could not copy link.');
    setTimeout(() => ui.setStatus(`${ui._items.length} discoveries found`), 1500);
  };
  ui.onOpenLink = (url) => openLink(url);
  ui.onScanVisuals = async () => {
    const videoId = currentVideoId || getVideoId();
    if (!videoId) return;
    const video = document.querySelector('video');
    if (!video) {
      ui.showError('No video player found.');
      return;
    }
    ui.setVisualScanning(true);
    ui.setStatus('Scanning video frames…');
    try {
      const visualDiscoveries = await scanVisuals(videoId, video);
      const existing = ui._items || [];
      const merged = mergeAndDedup(existing, visualDiscoveries);
      await saveDiscoveries(videoId, merged);
      ui.setItems(merged);
      ui.setStatus(`${merged.length} discovery${merged.length !== 1 ? 's' : ''} found`);
    } catch (err) {
      log('Visual scan failed:', err);
      ui.showError('Visual scan failed: ' + (err && err.message ? err.message : String(err)));
    } finally {
      ui.setVisualScanning(false);
    }
  };
}

async function init() {
  if (!isSupportedPage()) return;
  const videoId = getVideoId();
  if (!videoId) return;
  currentVideoId = videoId;

  ui.createPanel();
  bindPanel();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'CLIPFIND_RUN_ANALYSIS') {
      runAnalysis(message.videoId || getVideoId());
      sendResponse({ ok: true });
      return true;
    }
  });

  const stop = onNavigation((newVideoId) => {
    currentVideoId = newVideoId;
    if (newVideoId) {
      ui.createPanel();
      bindPanel();
      runAnalysis(newVideoId);
    }
  });

  runAnalysis(videoId).catch(log);
}

init().catch(log);

