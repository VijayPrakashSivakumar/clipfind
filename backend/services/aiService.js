/**
 * ClipFind — AI transcript analysis service (Phase 2).
 *
 * Sends a video transcript to an LLM and asks it to extract product / tool /
 * book / resource recommendations with supporting evidence.
 *
 * All LLM interaction happens server-side. The extension never receives or
 * stores API keys. If no API key is configured, analysis returns empty and the
 * extension falls back to keyword-based discovery (Phase 1 behavior).
 */

const { OpenAI } = require('openai');

let openai = null;
try {
  const apiKey = process.env.OPENAI_API_KEY || process.env.CLIPFIND_OPENAI_KEY;
  if (apiKey) {
    openai = new OpenAI({ apiKey });
  }
} catch {
  // openai package may not be installed; analysis will be unavailable.
}

const SYSTEM_PROMPT = `You are ClipFind, an assistant that extracts useful product, tool, book, and resource recommendations from YouTube video transcripts.

Rules:
- Only return items that are explicitly mentioned or clearly recommended in the transcript.
- For each item provide: name, category (products|software|education|resources|social|other), evidence (short quote/context from transcript), confidence (high|medium|low), and a matchStatus (Exact Match | Likely Match | Search Suggested).
- matchStatus "Exact Match" only if the transcript names a specific official website or creator-provided link. "Likely Match" if a real product/tool is named but no official URL is given. "Search Suggested" if the item is vague or unverified.
- Do not invent prices, ratings, release dates, or images.
- Do not hallucinate URLs. If you don't know the official URL, leave url empty and set matchStatus to "Search Suggested".
- Return a JSON array of objects. Each object: { name, category, evidence, confidence, matchStatus, url?, timestamp? }.
- If no recommendations are found, return an empty array [].
- Be conservative: fewer, accurate discoveries are better than many guessed ones.`;

function buildUserPrompt(transcriptText, videoTitle, channel) {
  return `
Video title: ${videoTitle || 'Unknown'}
Channel: ${channel || 'Unknown'}

Transcript:
${transcriptText}

Extract all product, tool, book, software, and resource recommendations mentioned in this transcript. Return only the JSON array.`;
}

async function analyzeWithOpenAI(transcriptText, videoTitle, channel) {
  if (!openai) {
    return { discoveries: [], error: 'No OpenAI API key configured' };
  }

  const response = await openai.chat.completions.create({
    model: process.env.CLIPFIND_AI_MODEL || 'gpt-4o-mini',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(transcriptText, videoTitle, channel) },
    ],
  });

  const content = response.choices[0].message.content || '[]';
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Some models wrap the array in an object; try to extract.
    const match = content.match(/\[[\s\S]*\]/);
    parsed = match ? JSON.parse(match[0]) : [];
  }

  if (!Array.isArray(parsed)) {
    return { discoveries: [], error: 'AI returned non-array response' };
  }

  const discoveries = parsed.map((item) => ({
    name: String(item.name || '').trim(),
    category: String(item.category || 'other').trim(),
    evidence: String(item.evidence || '').trim(),
    confidence: String(item.confidence || 'low').trim(),
    matchStatus: String(item.matchStatus || 'Search Suggested').trim(),
    url: item.url ? String(item.url).trim() : null,
    timestamp: item.timestamp != null ? Number(item.timestamp) : null,
    source: 'clipfind-ai',
  }));

  return { discoveries, error: null };
}

async function analyze(transcriptText, videoTitle, channel) {
  if (!transcriptText || transcriptText.trim().length < 20) {
    return { discoveries: [], error: 'Transcript too short to analyze' };
  }

  // Truncate transcript to stay within token limits (roughly 12k chars ~ 3k tokens).
  const trimmed = transcriptText.slice(0, 12000);

  return analyzeWithOpenAI(trimmed, videoTitle, channel);
}

module.exports = { analyze };
