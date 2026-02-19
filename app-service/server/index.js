import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { HuggingFaceInferenceEmbeddings } from '@langchain/community/embeddings/hf';

// ─── Configuration ───────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
const HF_API_KEY = process.env.HUGGINGFACEHUB_API_KEY || '';

if (!HF_API_KEY) {
  console.warn(
    '⚠  HUGGINGFACEHUB_API_KEY is not set. Embedding requests will fail.'
  );
}

// ─── LangChain Embedding Model ──────────────────────────────────
const embeddings = new HuggingFaceInferenceEmbeddings({
  apiKey: HF_API_KEY,
  model: EMBEDDING_MODEL,
});

// ─── Express App ─────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

/**
 * POST /api/embed
 * Body: { "text": "your query text" }
 * Response: { "embedding": number[], "model": string, "dimensions": number }
 */
app.post('/api/embed', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "text" field' });
    }

    const vector = await embeddings.embedQuery(text);
    return res.json({
      embedding: vector,
      model: EMBEDDING_MODEL,
      dimensions: vector.length,
    });
  } catch (err) {
    console.error('Embedding error:', err.message || err);
    return res.status(500).json({
      error: 'Embedding generation failed',
      details: err.message || String(err),
    });
  }
});

// ─── Filter & Rate Configuration ────────────────────────────────
const FILTER_RATE_MODEL =
  process.env.FILTER_RATE_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2';

const SYSTEM_PROMPT = `You are a classifier and rater for user prompts in a semantic caching system.

Given a user prompt, perform TWO tasks:

1. **Cache eligibility (shouldCache)**: Determine if the prompt is suitable for caching.
   - Return true ONLY for information-seeking, explanation, or exploration questions (e.g. "What is RAG?", "How does caching work?", "Explain vector embeddings").
   - Return false for instructions, code requests, action commands, or "do X" tasks (e.g. "Write a function", "Fix this bug", "Implement sorting").

2. **Quality rating (rating)**: Rate the prompt quality from 1 to 10 based on:
   - Amount of irrelevant noise (lower noise = higher rating)
   - Clarity of the request (clearer = higher rating)
   - Level of detail and specificity (more detail = higher rating)
   Also provide a short reason for the rating.

Respond with JSON ONLY, no markdown, no explanation. Format:
{"shouldCache": boolean, "rating": number, "reason": "string"}`;

/**
 * POST /api/filter-and-rate
 * Body: { "prompt": string }
 * Response: { "shouldCache": boolean, "rating": number, "reason": string }
 */
app.post('/api/filter-and-rate', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res
        .status(400)
        .json({ error: 'Missing or invalid "prompt" field' });
    }
    if (prompt.length > 5000) {
      return res
        .status(400)
        .json({ error: 'Prompt exceeds maximum length of 5000 characters' });
    }

    // ── Call HuggingFace Inference API ──────────────────────────
    const { HfInference } = await import('@huggingface/inference');
    const hf = new HfInference(HF_API_KEY);

    const response = await hf.textGeneration({
      model: FILTER_RATE_MODEL,
      inputs: `<s>[INST] ${SYSTEM_PROMPT}\n\nUser prompt: "${prompt}" [/INST]`,
      parameters: {
        max_new_tokens: 150,
        temperature: 0.1,
        return_full_text: false,
      },
    });

    // ── Parse model output ─────────────────────────────────────
    const raw = response.generated_text.trim();
    // Extract JSON from the response (model may wrap it in text)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('filter-and-rate: model did not return JSON, raw:', raw);
      return res.status(502).json({ error: 'Model did not return valid JSON' });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // ── Validate schema ────────────────────────────────────────
    if (
      typeof parsed.shouldCache !== 'boolean' ||
      typeof parsed.rating !== 'number' ||
      typeof parsed.reason !== 'string'
    ) {
      console.warn('filter-and-rate: invalid schema:', parsed);
      return res.status(502).json({ error: 'Model returned invalid schema' });
    }

    return res.json({
      shouldCache: parsed.shouldCache,
      rating: Math.max(1, Math.min(10, Math.round(parsed.rating))),
      reason: parsed.reason,
    });
  } catch (err) {
    console.error('filter-and-rate error:', err.message || err);
    return res.status(500).json({
      error: 'Filter and rate failed',
      details: err.message || String(err),
    });
  }
});

/**
 * GET /api/health
 * Simple health check that also reports model configuration.
 */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    model: EMBEDDING_MODEL,
    filterRateModel: FILTER_RATE_MODEL,
    hasApiKey: Boolean(HF_API_KEY),
  });
});


// ─── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Embedding server running on http://localhost:${PORT}`);
  console.log(`Model: ${EMBEDDING_MODEL}`);
});
