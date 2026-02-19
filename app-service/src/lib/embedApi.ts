import { textToVector } from './userStore';

// ============================================
// EMBEDDING API CLIENT
// ============================================
//
// Calls the Express embedding backend (POST /api/embed).
// Falls back to the local djb2 textToVector if the backend
// is unreachable or returns an error.
// ============================================

const EMBED_API_URL = import.meta.env.VITE_EMBED_API_URL || '/api';

interface EmbedResponse {
  embedding: number[];
  model: string;
  dimensions: number;
}

/**
 * Generate an embedding vector for the given text.
 *
 * - Tries the backend API first (`POST /api/embed`).
 * - On failure, falls back to the local `textToVector()` mock.
 *
 * @returns The embedding vector (384/768 dims from API, or 8 dims fallback).
 */
export async function embedText(text: string): Promise<number[]> {
  try {
    const res = await fetch(`${EMBED_API_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      console.warn(`Embed API returned ${res.status}, falling back to local embedding`);
      return textToVector(text);
    }

    const data: EmbedResponse = await res.json();
    return data.embedding;
  } catch (err) {
    console.warn('Embed API unreachable, falling back to local embedding:', err);
    return textToVector(text);
  }
}

/**
 * Check if the embedding backend is healthy.
 */
export async function checkEmbedHealth(): Promise<{
  available: boolean;
  model?: string;
}> {
  try {
    const res = await fetch(`${EMBED_API_URL}/health`);
    if (!res.ok) return { available: false };
    const data = await res.json();
    return { available: true, model: data.model };
  } catch {
    return { available: false };
  }
}
