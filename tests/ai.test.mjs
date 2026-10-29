/**
 * ClipFind — Phase 2 AI service tests.
 * Verifies analyze() handles missing API keys and short transcripts gracefully.
 * (Happy-path LLM output cannot be tested without a real OpenAI key.)
 */
import assert from 'node:assert/strict';

async function main() {
  // Ensure no API key is set so the module initializes with openai = null.
  delete process.env.OPENAI_API_KEY;
  delete process.env.CLIPFIND_OPENAI_KEY;

  // Fresh import — module top-level runs with no API key → openai stays null.
  const mod = await import('../backend/services/aiService.js');
  const analyze = mod.analyze;

  // 1. Too-short transcript → error (checked before API key).
  const r1 = await analyze('hi', 'Test Video', 'Test Channel');
  assert.strictEqual(r1.error, 'Transcript too short to analyze');

  // 2. Empty transcript → error.
  const r2 = await analyze('', 'Test Video', 'Test Channel');
  assert.strictEqual(r2.error, 'Transcript too short to analyze');

  // 3. Long transcript but no API key → graceful empty result.
  const r3 = await analyze('This is a transcript about a laptop and a camera that is long enough to pass the length check.', 'Test Video', 'Test Channel');
  assert.strictEqual(r3.error, 'No OpenAI API key configured');
  assert.deepStrictEqual(r3.discoveries, []);

  console.log('All Phase 2 AI tests passed.');
}

main().catch((err) => { console.error(err); process.exit(1); });


