/**
 * ClipFind — Visual recognition service (Phase 3).
 *
 * Sends video frames to OpenAI's vision model to identify products, tools,
 * books, software interfaces, and other useful items shown on screen.
 *
 * All vision API interaction happens server-side. The extension never sees
 * API keys. If no API key is configured, visual analysis returns empty and
 * the extension continues to work without it.
 */

const { OpenAI } = require('openai');

let openai = null;
try {
  const apiKey = process.env.OPENAI_API_KEY || process.env.CLIPFIND_VISION_KEY;
  if (apiKey) {
    openai = new OpenAI({ apiKey });
  }
} catch {
  // openai package may not be installed; visual analysis unavailable.
}

const SYSTEM_PROMPT = `You are ClipFind Vision, an assistant that identifies useful products, tools, books, software, and other resources shown in a YouTube video frame.

Rules:
- Only identify items that are clearly visible in the frame.
- For each item provide: name, category (products|software|education|resources|other), evidence (what you see in the frame), confidence (high|medium|low), matchStatus (Exact Match | Likely Match | Visual Similar).
- "Exact Match" only if you can confidently identify a specific brand/product. "Likely Match" if it's clearly a product type but exact model is uncertain. "Visual Similar" if it looks like a known product but you can't confirm.
- Do not invent prices, ratings, release dates, or purchase links.
- Do not hallucinate URLs. Leave url empty unless you are certain of the official website.
- Return a JSON array of objects. Each object: { name, category, evidence, confidence, matchStatus, url? }.
- If no useful items are visible, return an empty array [].
- Be conservative: fewer accurate identifications are better than many guesses.`;


function imageToDataUrl(imageBase64) {
  // imageBase64 may already be a data URL or raw base64.
  if (imageBase64.startsWith('data:')) return imageBase64;
  return `data:image/jpeg;base64,${imageBase64}`;
}

async function analyzeWithOpenAI(imageBase64, timestamp) {
  if (!openai) {
    return { discoveries: [], error: 'No OpenAI API key configured for vision' };
  }

  const imageUrl = imageToDataUrl(imageBase64);

  const response = await openai.chat.completions.create({
    model: process.env.CLIPFIND_VISION_MODEL || 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Frame timestamp: ${timestamp} seconds. Identify all useful products, tools, books, software, or resources visible in this frame. Return only the JSON array.` },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
        ],
      },
    ],
  });

  const content = response.choices[0].message.content || '[]';
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\[[\s\S]*\]/);
    parsed = match ? JSON.parse(match[0]) : [];
  }

  if (!Array.isArray(parsed)) {
    return { discoveries: [], error: 'Vision returned non-array response' };
  }

  const discoveries = parsed.map((item) => ({
    name: String(item.name || '').trim(),
    category: String(item.category || 'other').trim(),
    evidence: String(item.evidence || 'Visible in video frame').trim(),
    confidence: String(item.confidence || 'low').trim(),
    matchStatus: String(item.matchStatus || 'Visual Similar').trim(),
    url: item.url ? String(item.url).trim() : null,
    source: 'clipfind-vision',
    timestamp: Number(timestamp) || 0,
  }));

  return { discoveries, error: null };
}

async function analyzeFrame(imageBase64, timestamp) {
  return analyzeWithOpenAI(imageBase64, timestamp);
}

module.exports = { analyzeFrame };
