/**
 * ClipFind — analysis routes (Phase 2).
 *
 * POST /api/analyze
 * Body: { videoId, transcript, title?, channel? }
 * Calls the server-side AI service to extract recommendations from the transcript.
 * Returns { discoveries: [...], source: 'ai'|'fallback', error? }
 */

const express = require('express');
const { analyze } = require('../services/aiService');

const router = express.Router();

router.post('/analyze', express.json({ limit: '200kb' }), async (req, res) => {
  const { videoId, transcript, title, channel } = req.body || {};

  if (!videoId) {
    return res.status(400).json({ error: 'videoId is required' });
  }

  let result;
  try {
    result = await analyze(transcript || '', title || 'Unknown', channel || 'Unknown');
  } catch (err) {
    return res.status(500).json({
      error: 'AI analysis failed',
      message: err && err.message ? err.message : String(err),
    });
  }

  const discoveries = (result.discoveries || []).map((d) => ({
    ...d,
    videoId,
    source: d.source || 'clipfind-ai',
    discoveredAt: Date.now(),
    id: `ai-${videoId}-${Math.random().toString(36).slice(2, 10)}`,
  }));

  res.json({
    videoId,
    source: result.error ? 'fallback' : 'ai',
    error: result.error,
    discoveries,
  });
});

module.exports = router;
