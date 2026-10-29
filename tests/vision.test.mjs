/**
 * ClipFind — Phase 3 Vision service tests.
 * Verifies analyzeFrame() handles missing API key gracefully.
 */
import assert from 'node:assert/strict';

async function main() {
  delete process.env.OPENAI_API_KEY;
  delete process.env.CLIPFIND_VISION_KEY;

  const mod = await import('../backend/services/visionService.js');
  const analyzeFrame = mod.analyzeFrame;

  // No API key → graceful empty result.
  const r = await analyzeFrame('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD', 120);
  assert.strictEqual(r.error, 'No OpenAI API key configured for vision');
  assert.deepStrictEqual(r.discoveries, []);

  console.log('All Phase 3 Vision tests passed.');
}

main().catch((err) => { console.error(err); process.exit(1); });
