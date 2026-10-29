/**
 * ClipFind — Description link extraction & categorization.
 * Extracts creator-provided links from the video description and groups them
 * into categories. Does not modify or fabricate any link.
 */

const CATEGORIES = {
  products: ['amazon', 'ebay', 'etsy', 'walmart', 'target', 'bestbuy', 'aliexpress', 'shop', 'store', 'buy'],
  software: ['github', 'gitlab', 'bitbucket', 'figma', 'notion', 'discord', 'slack', 'zoom', 'microsoft', 'adobe', 'google', 'apple', 'app', 'software', 'tool', 'saas'],
  education: ['coursera', 'udemy', 'edx', 'khan', 'skillshare', 'tutorial', 'course', 'learn', 'documentation', 'docs', 'wiki'],
  social: ['twitter', 'x.com', 'instagram', 'tiktok', 'facebook', 'linkedin', 'twitch', 'reddit', 'discord', 'youtube'],
};

export function categorizeLink(url, text) {
  const lower = (text || '').toLowerCase() + ' ' + url.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return 'other';
}

export function extractDescriptionLinks(descriptionEl) {
  const links = [];
  if (!descriptionEl) return links;

  const seen = new Set();
  const anchors = descriptionEl.querySelectorAll('a[href]');
  for (const a of anchors) {
    const href = a.getAttribute('href');
    if (!href) continue;
    let url;
    try {
      url = new URL(href, location.origin).href;
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    links.push({
      url,
      text: (a.textContent || '').trim() || url,
      source: 'creator',
      category: categorizeLink(url, a.textContent),
    });
  }
  return links;
}

export function extractPlainTextLinks(text, baseUrl) {
  const links = [];
  if (!text) return links;
  const urlRegex = /https?:\/\/[^\s<>"'()]+/gi;
  const seen = new Set();
  for (const match of text.matchAll(urlRegex)) {
    let url;
    try {
      url = new URL(match[0]).href.replace(/[),.;!?]+$/, '');
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    links.push({
      url,
      text: url,
      source: 'creator',
      category: categorizeLink(url, ''),
    });
  }
  return links;
}
