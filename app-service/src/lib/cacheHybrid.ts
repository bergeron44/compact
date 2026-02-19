// ============================================
// CACHE WRAPPER (Service Only)
// ============================================
//
// Provides a unified interface that strictly uses
// the Cache Service backend.
// ============================================

import {
    checkCacheFromService,
    addToCacheService,
    findTopCacheMatchesService,
    getCacheStatsService,
    getCacheEntriesService,
    deleteCacheEntriesService,
    clearProjectCacheService,
    type CacheEntry,
    type CacheMatch,
    recordPromptActivityService,
    incrementCacheHitService,
    voteCacheEntryService,
} from './cacheServiceApi';

import { getSession } from './session';

/**
 * Universal cache check - routes to appropriate backend
 */
export async function checkCache(
    projectId: string,
    query: string
): Promise<{ hit: boolean; entry?: CacheEntry; similarity?: number; queryVector?: number[] }> {
    const session = getSession();
    const userId = session?.employeeId || 'unknown';

    return checkCacheFromService(projectId, userId, query) as Promise<any>;
}

/**
 * Universal cache addition - routes to appropriate backend
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
): Promise<CacheEntry | null> {
    return addToCacheService(projectId, employeeId, query, compressedPrompt, llmResponse, metrics) as Promise<any>;
}

export async function findTopCacheMatches(
    projectId: string,
    query: string,
    limit = 5,
    threshold = 0
): Promise<{ matches: CacheMatch[]; queryVector: number[] }> {
    return findTopCacheMatchesService(projectId, query, limit, threshold);
}

export async function getCacheStats(projectId: string) {
    return getCacheStatsService(projectId);
}

export async function getCacheEntries(projectId: string): Promise<CacheEntry[]> {
    return getCacheEntriesService(projectId);
}

export async function deleteCacheEntries(projectId: string, indices: (string | number)[]) {
    return deleteCacheEntriesService(projectId, indices);
}

export async function clearProjectCache(projectId: string) {
    return clearProjectCacheService(projectId);
}

export async function acceptCacheHit(dbId: string | number): Promise<void> {
    const session = getSession();
    // Use optional chaining and fallback
    const userId = session?.employeeId || 'unknown';
    const projectId = session?.projectName || 'default-project';

    // 1. Increment the hit count for the specific entry (and project stats)
    await incrementCacheHitService(projectId, dbId);

    // 2. Log the activity. We don't have the query text here, so we use a marker.
    // Ideally, the caller should pass the query text or we fetch the entry.
    // For now, we specific 'CACHE_SELECTION' as query_text to indicate a selection event.
    await recordPromptActivityService(
        userId,
        projectId,
        `[CACHE_SELECTION] Entry=${dbId}`,
        true // cached=true because they selected a cache hit
    );
}

export async function exportCacheAsJSON(projectId: string): Promise<string> {
    const entries = await getCacheEntries(projectId);
    return JSON.stringify(entries, null, 2);
}

export async function voteCacheEntry(projectId: string, entryId: string | number, voteType: 'like' | 'dislike') {
    return voteCacheEntryService(projectId, entryId, voteType);
}

export type { CacheEntry, CacheMatch };
