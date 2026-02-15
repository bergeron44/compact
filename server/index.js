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

/**
 * GET /api/health
 * Simple health check that also reports model configuration.
 */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    model: EMBEDDING_MODEL,
    hasApiKey: Boolean(HF_API_KEY),
  });
});

// ─── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Embedding server running on http://localhost:${PORT}`);
  console.log(`Model: ${EMBEDDING_MODEL}`);
});
