/**
 * ClipFind service worker (Manifest V3).
 * Coordinates extension state and forwards messages between the popup,
 * content script, and optional backend.
 */
const CLIENT_ID = 'clipfind';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ClipFind] Service worker installed');
  chrome.storage.local.set({ version: chrome.runtime.getManifest().version });
});

/**
 * Handle messages from content script / popup.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type } = message || {};
  if (type === 'CLIPFIND_GET_MANIFEST_VERSION') {
    sendResponse({ version: chrome.runtime.getManifest().version });
    return true;
  }
  if (type === 'CLIPFIND_GET_TAB_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      sendResponse({
        url: tab && tab.url,
        title: tab && tab.title,
        id: tab && tab.id,
      });
    });
    return true;
  }
  return false;
});
