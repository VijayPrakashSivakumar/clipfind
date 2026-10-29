/**
 * ClipFind extension popup.
 * Shows the active YouTube video (if any), analysis status, and privacy controls.
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
  privacyCard: document.getElementById('privacy-card'),
  btnClearHistory: document.getElementById('btn-clear-history'),
  btnClearLocal: document.getElementById('btn-clear-local'),
  toggleAi: document.getElementById('toggle-ai'),
  toggleVisual: document.getElementById('toggle-visual'),
  toggleAiLabel: document.getElementById('toggle-ai-label'),
  toggleVisualLabel: document.getElementById('toggle-visual-label'),
  versionEl: document.getElementById('version'),
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

function escapeHtml(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
async function refresh() {
  const { url, title, id } = await sendMessage({ type: 'CLIPFIND_GET_TAB_INFO' });
  const isYT = isYouTubeVideo(url);
  currentVideoId = isYT ? videoIdFromUrl(url) : null;

  els.card.hidden = !isYT;
  els.privacyCard.hidden = !isYT;

  if (isYT) {
    els.title.textContent = title || 'YouTube video';
    els.status.textContent = 'Ready to analyze';
    els.btnAnalyze.disabled = false;
    els.btnOpenPanel.disabled = false;
    els.btnAnalyze.onclick = () => {
      chrome.tabs.sendMessage(id, { type: 'CLIPFIND_RUN_ANALYSIS', videoId: currentVideoId });
      window.close();
    };
    els.btnOpenPanel.onclick = () => {
      chrome.tabs.update(id, { active: true });
      window.close();
    };
    await loadCount(currentVideoId);
  } else {
    els.status.textContent = 'Open a YouTube video to get started';
  }

  await loadRecent();
  await loadSettings();
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

async function loadSettings() {
  const settings = await chrome.storage.local.get(['clipfind:settings', 'clipfind:version']);
  const version = settings['clipfind:version'] || chrome.runtime.getManifest().version;
  els.versionEl.textContent = version;

  const settingsObj = settings['clipfind:settings'] || {};
  els.toggleAi.checked = settingsObj.aiAnalysis !== false;
  els.toggleVisual.checked = settingsObj.visualScanning !== false;
  updateToggleLabels();
}

async function saveSettings() {
  await chrome.storage.local.set({
    'clipfind:settings': {
      aiAnalysis: els.toggleAi.checked,
      visualScanning: els.toggleVisual.checked,
    },
    'clipfind:version': chrome.runtime.getManifest().version,
  });
}

function updateToggleLabels() {
  els.toggleAiLabel.textContent = els.toggleAi.checked ? 'Enabled (requires backend AI key)' : 'Disabled';
  els.toggleVisualLabel.textContent = els.toggleVisual.checked ? 'Enabled (requires backend AI key)' : 'Disabled';
}

els.btnClearHistory.onclick = async () => {
  if (!confirm('Clear all discovery history for this video?')) return;
  try {
    if (currentVideoId) {
      await chrome.storage.local.remove(`clipfind:discoveries:${currentVideoId}`);
    }
    els.status.textContent = 'History cleared.';
  } catch {
    els.status.textContent = 'Unable to clear history.';
  }
};

els.btnClearLocal.onclick = async () => {
  if (!confirm('Clear ALL discovery history across all videos? This cannot be undone.')) return;
  try {
    const all = await chrome.storage.local.get(null);
    const removals = Object.keys(all).filter((k) => k.startsWith('clipfind:discoveries:'));
    await chrome.storage.local.remove(removals);
    els.status.textContent = 'All history cleared.';
  } catch {
    els.status.textContent = 'Unable to clear history.';
  }
};

els.toggleAi.addEventListener('change', async () => {
  await saveSettings();
  updateToggleLabels();
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
      if (tab.id && tab.url && isYouTubeVideo(tab.url)) {
        chrome.tabs.sendMessage(tab.id, { type: 'CLIPFIND_SETTINGS_UPDATED' });
      }
    }
  } catch {}
});

els.toggleVisual.addEventListener('change', async () => {
  await saveSettings();
  updateToggleLabels();
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
      if (tab.id && tab.url && isYouTubeVideo(tab.url)) {
        chrome.tabs.sendMessage(tab.id, { type: 'CLIPFIND_SETTINGS_UPDATED' });
      }
    }
  } catch {}
});

refresh().catch(console.error);
