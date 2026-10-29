/**
 * ClipFind — core unit tests (Node, no browser).
 * Covers pure logic modules: YouTube URL parsing, description link extraction,
 * categorization, discovery/dedup, and time formatting.
 */
import assert from 'node:assert/strict';
import { getVideoIdFromUrl } from '../modules/youtube.js';
import {
  extractDescriptionLinks,
  extractPlainTextLinks,
  categorizeLink,
} from '../modules/description.js';
import {
  discoverFromLinks,
  discoverFromKeywords,
  mergeAndDedup,
  buildSearchUrl,
} from '../modules/discovery.js';
import { ui } from '../modules/ui.js';

// Browser globals used by the description extractor are unavailable in Node.
globalThis.location = { origin: 'https://www.youtube.com', href: 'https://www.youtube.com/watch?v=x' };

// ---- YouTube URL parsing ----
assert.strictEqual(getVideoIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.strictEqual(getVideoIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s'), 'dQw4w9WgXcQ');
assert.strictEqual(getVideoIdFromUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.strictEqual(getVideoIdFromUrl('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.strictEqual(getVideoIdFromUrl('https://www.google.com/search?q=x'), null);
assert.strictEqual(getVideoIdFromUrl('not a url'), null);

// ---- Categorization ----
assert.strictEqual(categorizeLink('https://amazon.com/x', 'Buy thing'), 'products');
assert.strictEqual(categorizeLink('https://github.com/user/repo', 'Repo'), 'software');
assert.strictEqual(categorizeLink('https://coursera.org/course', 'Course'), 'education');
assert.strictEqual(categorizeLink('https://twitter.com/user', 'Profile'), 'social');
assert.strictEqual(categorizeLink('https://random.example.com/x', 'Hello'), 'other');

// ---- Description link extraction ----
const doc = {
  querySelectorAll: () => [
    { getAttribute: () => 'https://example.com/tool', textContent: 'Example Tool' },
    { getAttribute: () => 'https://example.com/tool', textContent: 'Example Tool' }, // duplicate
    { getAttribute: () => 'https://shop.example.com/buy', textContent: 'Buy now' },
  ],
};
const links = extractDescriptionLinks(doc);
assert.strictEqual(links.length, 2, 'should dedup description links');
assert.strictEqual(links[0].source, 'creator');
assert.strictEqual(links[0].category, 'software');

const plain = extractPlainTextLinks('Check https://example.com/book and https://shop.example.com/x.');
assert.ok(plain.some((l) => l.url === 'https://example.com/book'));
assert.ok(plain.some((l) => l.url === 'https://shop.example.com/x'));

// ---- buildSearchUrl ----
const searchUrl = buildSearchUrl('Super Laptop');
assert.ok(searchUrl.includes('https://www.google.com/search?q='));
assert.ok(searchUrl.includes('%22Super%20Laptop%22'));

// ---- discoverFromLinks ----
const segs = [{ start: 10, end: 20, text: 'I love the Example Tool' }];
const dLinks = discoverFromLinks(links, 'vid1', segs);
assert.ok(dLinks.length >= 1);
const tool = dLinks.find((d) => d.name === 'Example Tool');
assert.ok(tool, 'should discover Example Tool');
assert.strictEqual(tool.source, 'creator');
assert.ok(['Exact Match', 'Likely Match', 'Search Suggested'].includes(tool.matchStatus));
// Duplicate URLs should be collapsed.
const urls = dLinks.map((d) => d.url);
assert.strictEqual([...new Set(urls)].length, urls.length);

// ---- discoverFromKeywords ----
const dKeys = discoverFromKeywords('This video shows a macbook and a camera.', 'vid1', segs);
assert.ok(dKeys.some((d) => d.name.toLowerCase() === 'macbook'), 'should detect macbook');
assert.ok(dKeys.some((d) => d.name.toLowerCase() === 'camera'), 'should detect camera');
assert.ok(dKeys.every((d) => d.source === 'clipfind'));

// ---- mergeAndDedup ----
const merged = mergeAndDedup(dLinks, dKeys);
const ids = merged.map((d) => d.id);
assert.strictEqual([...new Set(ids)].length, ids.length, 'no duplicate ids');

// 3-way merge with AI discoveries.
const aiDisc = [{
  id: 'ai-vid1-macbook',
  videoId: 'vid1',
  name: 'MacBook Pro',
  category: 'products',
  url: 'https://apple.com/macbook-pro',
  source: 'clipfind-ai',
  matchStatus: 'Likely Match',
  evidence: 'AI found this in transcript',
  timestamp: 120,
  confidence: 'high',
  discoveredAt: Date.now(),
  thumbnail: null,
}];
const merged3 = mergeAndDedup(dLinks, dKeys, aiDisc);
assert.ok(merged3.some((d) => d.name === 'MacBook Pro' && d.source === 'clipfind-ai'), 'AI discovery included');
const ids3 = merged3.map((d) => d.id);
assert.strictEqual([...new Set(ids3)].length, ids3.length, '3-way merge has no duplicate ids');

// Visual discovery merge (Phase 3).
const visualDisc = [{
  id: 'vision-vid1-1',
  videoId: 'vid1',
  name: 'iPhone',
  category: 'products',
  url: null,
  source: 'clipfind-vision',
  matchStatus: 'Likely Match',
  evidence: 'Visible in video frame at 04:35',
  timestamp: 275,
  confidence: 'medium',
  discoveredAt: Date.now(),
  thumbnail: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD',
}];
const merged4 = mergeAndDedup(dLinks, dKeys, aiDisc, visualDisc);
assert.ok(merged4.some((d) => d.name === 'iPhone' && d.source === 'clipfind-vision'), 'Visual discovery included');
assert.ok(merged4.some((d) => d.thumbnail), 'Visual discovery has thumbnail');
const ids4 = merged4.map((d) => d.id);
assert.strictEqual([...new Set(ids4)].length, ids4.length, '4-way merge has no duplicate ids');

// ---- formatTime ----
assert.strictEqual(ui.formatTime(0), '0:00');
assert.strictEqual(ui.formatTime(60), '1:00');
assert.strictEqual(ui.formatTime(125), '2:05');
assert.strictEqual(ui.formatTime(90), '1:30');
assert.strictEqual(ui.formatTime(5), '0:05');

console.log('All ClipFind core tests passed.');
