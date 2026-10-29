/**
 * ClipFind extension popup.
 * Shows the active YouTube video (if any), analysis status, and recent discoveries.
 * Does NOT read YouTube page DOM directly; relies on tab info + storage.
 */
import { sendMessage } from './modules/messaging.js';

const MAX_RECENT = 5;

const els = {
  card: document.getElementById('current-video-card'),
  title: document.getElementById('current-video-title'),
  status: document.getElementById('current-video-status'),
  btnAnalyze: document.getElementById('btn-analyze'),
  btnOpenPanel: document.getElementById('btn-open-panel'),
  count: document.getElementById('current-video-count'),
  recentCard: document.getElementById('recent-card'),
  recentList: document.getElementById('recent-list'),
  btnClear: document.getElementById('btn-clear-history'),
};

let currentVideoId = null;

function isYouTubeVideo(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname.endsWith('youtube.com') &&
      (u.pathname.startsWith('/watch') || u.pathname.startsWith('/shorts/'));
  } catch {
    return false;
  }
}

function videoIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/watch')) return u.searchParams.get('v');
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/').pop();
  } catch {}
  return null;
}

async function refresh() {
  const { url, title, id } = await sendMessage({ type: 'CLIPFIND_GET_TAB_INFO' });
  const isYT = isYouTubeVideo(url);
  currentVideoId = isYT ? videoIdFromUrl(url) : null;

  els.card.hidden = !isYT;
  els.recentCard.hidden = false;

  if (isYT) {
    els.title.textContent = title || 'YouTube video';
    els.status.textContent = 'Ready to analyze';
    els.btnAnalyze.disabled = false;
    els.btnOpenPanel.disabled = false;
    els.btnAnalyze.onclick = () => {
      // Tell the content script on the active tab to run analysis.
      chrome.tabs.sendMessage(id, { type: 'CLIPFIND_RUN_ANALYSIS', videoId: currentVideoId });
      window.close();
    };
    els.btnOpenPanel.onclick = () => {
      // Panel is created by the content script; just focus the tab.
      chrome.tabs.update(id, { active: true });
      window.close();
    };
    await loadCount(currentVideoId);
  } else {
    els.status.textContent = 'Open a YouTube video to get started';
  }

  await loadRecent();
}

async function loadCount(videoId) {
  try {
    const res = await chrome.storage.local.get(`clipfind:discoveries:${videoId}`);
    const arr = res[`clipfind:discoveries:${videoId}`] || [];
    els.count.textContent = `${arr.length} discovery${arr.length !== 1 ? 's' : ''} found`;
  } catch {
    els.count.textContent = '';
  }
}

async function loadRecent() {
  try {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith('clipfind:discoveries:'));
    const recent = [];
    for (const k of keys) {
      const arr = all[k] || [];
      for (const item of arr) {
        recent.push({ ...item, videoId: k.split(':').pop() });
      }
    }
    recent.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const top = recent.slice(0, MAX_RECENT);
    if (top.length === 0) {
      els.recentList.textContent = 'No recent discoveries.';
      return;
    }
    els.recentList.innerHTML = '';
    for (const item of top) {
      const d = document.createElement('div');
      d.className = 'recent-item';
      d.innerHTML = `<div class="recent-name">${escapeHtml(item.name || 'Item')}</div>
        <div class="recent-meta">${escapeHtml(item.category || '')} &middot; ${item.ts ? new Date(item.ts).toLocaleDateString() : ''}</div>`;
      els.recentList.appendChild(d);
    }
  } catch {
    els.recentList.textContent = 'Unable to load history.';
  }
}

function escapeHtml(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

els.btnClear.onclick = async () => {
  try {
    const all = await chrome.storage.local.get(null);
    const removals = Object.keys(all).filter((k) => k.startsWith('clipfind:discoveries:'));
    await chrome.storage.local.remove(removals);
    els.recentList.textContent = 'History cleared.';
  } catch {
    els.recentList.textContent = 'Unable to clear history.';
  }
};

refresh().catch(console.error);
