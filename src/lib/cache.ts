import { localDB, type CacheValue } from './storage/db';
import { cosineSimilarity } from './userStore';
import { embedText } from './embedApi';

// ============================================
// CACHE ENTRY INTERFACE
// ============================================

export interface CacheEntry {
  queryText: string;
  llmResponse: string;
  /** The compressed prompt that was sent to the LLM (with §-dictionary) */
  compressedPrompt: string;
  hitCount: number;
  compressionRatio: number;
  originalTokens: number;
  compressedTokens: number;
  vector: number[];
  createdAt: string;
  lastAccessed: string;
  /** Employee who created this cache entry */
  employeeId?: string;
}

// ============================================
// HELPERS
// ============================================

function toCacheEntry(val: CacheValue): CacheEntry {
  return {
    queryText: val.queryText,
    llmResponse: val.llmResponse,
    compressedPrompt: val.compressedPrompt,
    hitCount: val.hitCount,
    compressionRatio: val.compressionRatio,
    originalTokens: val.originalTokens,
    compressedTokens: val.compressedTokens,
    vector: val.embedding,
    createdAt: val.createdAt,
    lastAccessed: val.lastAccessed,
    employeeId: val.employeeId,
  };
}

// ============================================
// CACHE OPERATIONS (async / IndexedDB)
// ============================================

export async function checkCache(
  projectId: string,
  query: string
): Promise<{ hit: boolean; entry?: CacheEntry; similarity?: number; queryVector?: number[] }> {
  const entries = await localDB.getCacheByProject(projectId);
  if (entries.length === 0) return { hit: false };

  const queryVector = await embedText(query);

  for (const entry of entries) {
    const emb = entry.embedding?.length ? entry.embedding : [];
    if (emb.length === 0) continue;
    // Skip entries whose embedding dimension doesn't match (legacy 8-dim vs new 384/768-dim)
    if (emb.length !== queryVector.length) continue;
    const sim = cosineSimilarity(queryVector, emb);
    if (sim > 0.85) {
      await localDB.updateCacheHit(entry.id!);
      return {
        hit: true,
        entry: {
          ...toCacheEntry(entry),
          hitCount: entry.hitCount + 1,
          lastAccessed: new Date().toISOString(),
        },
        similarity: sim,
        queryVector,
      };
    }
  }
  return { hit: false, queryVector };
}

/**
 * Store a cache entry with the compressed prompt and the real LLM response.
 *
 * @param projectId  - org-wide project name (shared cache key)
 * @param employeeId - the employee who created this entry
 * @param query      - the original user query
 * @param compressedPrompt - the prompt after compression (with §-dictionary), sent to LLM
 * @param llmResponse - the real, uncompressed LLM response
 * @param metrics    - token metrics from the compression result
 */
export async function addToCache(
  projectId: string,
  employeeId: string,
  query: string,
  compressedPrompt: string,
  llmResponse: string,
  metrics: {
    originalTokens: number;
    compressedTokens: number;
    compressionPercentage: number;
  }
): Promise<CacheEntry> {
  const embedding = await embedText(query);
  const compressionRatio = Math.round(metrics.compressionPercentage);

  await localDB.addToCache({
    projectId,
    employeeId,
    queryText: query,
    llmResponse,
    compressedPrompt,
    embedding,
    compressionRatio,
    originalTokens: metrics.originalTokens,
    compressedTokens: metrics.compressedTokens,
  });

  return {
    queryText: query,
    llmResponse,
    compressedPrompt,
    hitCount: 1,
    compressionRatio,
    originalTokens: metrics.originalTokens,
    compressedTokens: metrics.compressedTokens,
    vector: embedding,
    createdAt: new Date().toISOString(),
    lastAccessed: new Date().toISOString(),
    employeeId,
  };
}

// ============================================
// CACHE SUGGESTION (top-N matches)
// ============================================

export interface CacheMatch {
  entry: CacheEntry;
  similarity: number;
  /** Internal DB id – used by acceptCacheHit */
  _dbId: number;
}

/**
 * Find the top `limit` cache entries closest to `query` by cosine
 * similarity.  By default returns the 5 nearest with NO threshold,
 * so the UI always shows distances.  Does NOT update hitCount – call
 * `acceptCacheHit` once the user actually picks a suggestion.
 */
export async function findTopCacheMatches(
  projectId: string,
  query: string,
  limit = 5,
  threshold = 0,
): Promise<{ matches: CacheMatch[]; queryVector: number[] }> {
  const entries = await localDB.getCacheByProject(projectId);
  if (entries.length === 0) return { matches: [], queryVector: [] };

  const queryVector = await embedText(query);
  const scored: CacheMatch[] = [];

  for (const entry of entries) {
    const emb = entry.embedding?.length ? entry.embedding : [];
    if (emb.length === 0) continue;
    if (emb.length !== queryVector.length) continue;

    const sim = cosineSimilarity(queryVector, emb);
    if (sim > threshold) {
      scored.push({ entry: toCacheEntry(entry), similarity: sim, _dbId: entry.id! });
    }
  }

  // Sort descending by similarity, take top `limit`
  scored.sort((a, b) => b.similarity - a.similarity);
  return { matches: scored.slice(0, limit), queryVector };
}

/** Increment hitCount for an accepted cache suggestion */
export async function acceptCacheHit(dbId: number): Promise<void> {
  await localDB.updateCacheHit(dbId);
}

// ============================================
// STATS & MANAGEMENT
// ============================================

export async function getCacheStats(projectId: string) {
  return await localDB.getCacheStats(projectId);
}

export async function clearProjectCache(projectId: string) {
  await localDB.clearCacheForProject(projectId);
}

export async function getCacheEntries(projectId: string): Promise<CacheEntry[]> {
  const entries = await localDB.getCacheByProject(projectId);
  return entries.map(toCacheEntry);
}

export async function deleteCacheEntries(projectId: string, indices: number[]) {
  await localDB.deleteCacheByIndices(projectId, indices);
}

export async function exportCacheAsJSON(projectId: string): Promise<string> {
  const entries = await getCacheEntries(projectId);
  return JSON.stringify(entries, null, 2);
}
