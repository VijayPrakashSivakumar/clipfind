/**
 * ClipFind — visual analysis routes (Phase 3).
 *
 * POST /api/analyze-frame
 * Body: { videoId, timestamp, imageBase64 }
 * Analyzes a single video frame for visible products/resources.
 * Returns { discoveries: [...], source: 'vision'|'fallback', error? }
 */

const express = require('express');
const { analyzeFrame } = require('../services/visionService');

const router = express.Router();

router.post('/analyze-frame', express.json({ limit: '4mb' }), async (req, res) => {
  const { videoId, timestamp, imageBase64 } = req.body || {};

  if (!videoId) {
    return res.status(400).json({ error: 'videoId is required' });
  }
  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  let result;
  try {
    result = await analyzeFrame(imageBase64, timestamp || 0);
  } catch (err) {
    return res.status(500).json({
      error: 'Vision analysis failed',
      message: err && err.message ? err.message : String(err),
    });
  }

  const discoveries = (result.discoveries || []).map((d) => ({
    ...d,
    videoId,
    source: d.source || 'clipfind-vision',
    discoveredAt: Date.now(),
    id: `vision-${videoId}-${Math.random().toString(36).slice(2, 10)}`,
    thumbnail: imageBase64, // include frame thumbnail for UI
  }));

  res.json({
    videoId,
    timestamp: Number(timestamp) || 0,
    source: result.error ? 'fallback' : 'vision',
    error: result.error,
    discoveries,
  });
});

module.exports = router;
