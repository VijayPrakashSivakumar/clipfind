/**
 * ClipFind — YouTube page detection & metadata extraction.
 * Reads video id, title, channel, and description from the watch page DOM
 * and from the initial player response embedded in the HTML.
 */

export function getVideoIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('youtube.com') || u.hostname.endsWith('youtu.be')) {
      if (u.pathname.startsWith('/watch')) return u.searchParams.get('v');
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/').pop();
      if (u.hostname === 'youtu.be') return u.pathname.slice(1);
    }
  } catch {}
  return null;
}

export function getVideoId() {
  return getVideoIdFromUrl(location.href);
}

/**
 * Best-effort extraction of video metadata from the page.
 * YouTube is an SPA; metadata may live in ytInitialPlayerResponse or the DOM.
 * Returns null for anything unavailable (graceful degradation).
 */
export function extractMetadata() {
  const result = {
    videoId: getVideoId(),
    title: null,
    channel: null,
    description: null,
    viewCount: null,
    publishDate: null,
    captionsAvailable: false,
  };

  const metaTitle = document.querySelector('meta[name="title"]');
  if (metaTitle && metaTitle.content) result.title = metaTitle.content.trim();

  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (!result.title && ogTitle && ogTitle.content) result.title = ogTitle.content.trim();

  const titleEl = document.querySelector('h1.ytd-watch-metadata, h1#title, h1');
  if (!result.title && titleEl) result.title = titleEl.textContent.trim();

  const channelEl =
    document.querySelector('#channel-title, ytd-channel-name') ||
    document.querySelector('a.yt-simple-endpoint[href*="/@"]');
  if (channelEl) result.channel = channelEl.textContent.trim();

  const descriptionEl = document.querySelector('#description') || document.querySelector('#description-content');
  if (descriptionEl) result.description = descriptionEl.textContent.trim();

  // Try the embedded player response for richer metadata + caption tracks.
  try {
    const playerResponse = window.ytInitialPlayerResponse || window.ytInitialData;
    if (playerResponse) {
      const micro = playerResponse.microformat || playerResponse.microformatData || {};
      const playerMicro = micro.playerMicroformatRenderer || {};
      if (!result.title && playerMicro.title) {
        result.title = playerMicro.title.simpleText || playerMicro.title;
      }
      if (!result.channel && playerMicro.owner) {
        const owner = playerMicro.owner.ownerRenderer || playerMicro.owner.ownerProfileRenderer || {};
        result.channel = owner.title && owner.title.simpleText ? owner.title.simpleText : owner.title;
      }
      if (playerMicro.viewCount) result.viewCount = playerMicro.viewCount.simpleText;
      if (playerMicro.publishDate) result.publishDate = playerMicro.publishDate.simpleText;

      // Caption tracks
      const captions = playerResponse.captions || playerResponse.captionsRenderer;
      const tracks = (captions && captions.captionTracks) || [];
      result.captionsAvailable = Array.isArray(tracks) && tracks.length > 0;
      result.captionTracks = tracks;
    }
  } catch {
    // Ignore parse errors; fallback to DOM values above.
  }

  return result;
}

/**
 * Watch the URL for SPA navigation between YouTube videos and invoke onChange(videoId).
 * Returns a cleanup function.
 */
export function onNavigation(onChange) {
  let previousUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== previousUrl) {
      previousUrl = location.href;
      const id = getVideoId();
      if (id) onChange(id);
      else onChange(null);
    }
  });
  observer.observe(document, { subtree: true, childList: true });
  return () => observer.disconnect();
}

export function isSupportedPage() {
  return /^https:\/\/(www\.)?youtube\.com\/(watch|shorts)/.test(location.href);
}
