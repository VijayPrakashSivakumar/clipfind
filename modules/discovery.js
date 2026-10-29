/**
 * ClipFind — Discovery engine (Phase 1 MVP).
 *
 * Detects a limited but useful set of product / tool / resource mentions from:
 *  - creator description links
 *  - plain-text URLs in description
 *  - keyword hints in transcript / description text
 *
 * Each discovery is honest: no invented prices, ratings, or images.
 * matchStatus is one of: 'Exact Match' | 'Likely Match' | 'Search Suggested'.
 * Never claims a link is official unless it comes straight from the creator.
 */

const PRODUCT_KEYWORDS = [
  'laptop', 'macbook', 'iphone', 'camera', 'lens', 'microphone', 'mic', 'headphones',
  'earbuds', 'monitor', 'keyboard', 'mouse', 'desk', 'chair', 'lamp', 'pc', 'gpu',
  'cpu', 'phone', 'tablet', 'watch', 'airpods', 'speaker', 'tripod', 'gimbal',
  'software', 'app', 'plugin', 'extension', 'tool', 'platform', 'service', 'book',
  'novel', 'guide', 'course', 'template', 'notion', 'figma', 'discord',
];

function keywordMatch(text) {
  const lower = (text || '').toLowerCase();
  return PRODUCT_KEYWORDS.some((kw) => lower.includes(kw));
}

export function buildSearchUrl(name) {
  const q = encodeURIComponent(`"${name}" official website`);
  return `https://www.google.com/search?q=${q}`;
}

export function discoverFromLinks(links, videoId, transcriptSegments = []) {
  const discoveries = [];
  const seen = new Set();

  const transcriptText = transcriptSegments.map((s) => s.text).join(' ');

  for (const link of links) {
    const { url, text, source, category } = link;
    const name = text || url;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const isCreator = source === 'creator';
    let matchStatus = 'Search Suggested';
    let evidence = `Creator-provided link found in video description.`;
    if (!isCreator) {
      evidence = `URL found in video description text.`;
    }

    // Refine match status & evidence using transcript context.
    const mentionedInTranscript = transcriptText.toLowerCase().includes((name || '').toLowerCase().slice(0, 40));
    if (isCreator && mentionedInTranscript) matchStatus = 'Exact Match';
    else if (isCreator) matchStatus = 'Likely Match';
    else if (mentionedInTranscript) matchStatus = 'Likely Match';
    else matchStatus = 'Search Suggested';

    // Timestamp: find first transcript segment mentioning the name.
    let timestamp = null;
    let context = evidence;
    for (const seg of transcriptSegments) {
      if (seg.text.toLowerCase().includes((name || '').toLowerCase().slice(0, 30))) {
        timestamp = seg.start;
        context = seg.text;
        break;
      }
    }

    discoveries.push({
      id: `${videoId}-${key}`,
      videoId,
      name: name || 'Untitled link',
      category,
      url,
      source,
      matchStatus,
      evidence: context,
      timestamp,
      confidence: isCreator ? 'high' : mentionedInTranscript ? 'medium' : 'low',
      discoveredAt: Date.now(),
      thumbnail: null, // Phase 3: visual recognition may add images
    });
  }

  return discoveries;
}

export function discoverFromKeywords(text, videoId, transcriptSegments = []) {
  const discoveries = [];
  const seen = new Set();
  if (!text) return discoveries;

  const segmentsByText = {};
  for (const seg of transcriptSegments) {
    segmentsByText[seg.start] = seg;
  }

  for (const kw of PRODUCT_KEYWORDS) {
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let match;
    while ((match = re.exec(text)) !== null) {
      const name = match[0];
      const key = `${kw}-${match.index}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let timestamp = null;
      let context = `Mention of "${name}" detected in video text.`;
      for (const seg of transcriptSegments) {
        if (seg.text.toLowerCase().includes(name.toLowerCase())) {
          timestamp = seg.start;
          context = seg.text;
          break;
        }
      }

      discoveries.push({
        id: `${videoId}-kw-${match.index}`,
        videoId,
        name,
        category: categorizeKeyword(name),
        url: buildSearchUrl(name),
        source: 'clipfind',
        matchStatus: 'Search Suggested',
        evidence: context,
        timestamp,
        confidence: 'low',
        discoveredAt: Date.now(),
        thumbnail: null,
      });
    }
  }

  return discoveries;
}

function categorizeKeyword(name) {
  const lower = name.toLowerCase();
  const software = ['software', 'app', 'plugin', 'extension', 'tool', 'platform', 'notion', 'figma', 'discord', 'service'];
  const education = ['book', 'novel', 'guide', 'course', 'template'];
  if (software.some((s) => lower.includes(s))) return 'software';
  if (education.some((s) => lower.includes(s))) return 'education';
  return 'products';
}

export function mergeAndDedup(...arrays) {
  const map = new Map();
  for (const arr of arrays) {
    for (const item of arr) {
      const key = item.id;
      if (!map.has(key)) map.set(key, item);
      // Keep the version with better confidence if duplicate.
      const existing = map.get(key);
      const rank = (c) => (c === 'high' ? 3 : c === 'medium' ? 2 : 1);
      if (rank(item.confidence || 'low') > rank(existing.confidence || 'low')) {
        map.set(key, item);
      }
    }
  }
  return [...map.values()].sort((a, b) => {
    const catOrder = { products: 0, software: 1, education: 2, social: 3, other: 4 };
    return (catOrder[a.category] || 99) - (catOrder[b.category] || 99) ||
      (b.timestamp || 0) - (a.timestamp || 0);
  });
}
