// ============================================
// HYBRID CACHE WRAPPER
// ============================================
//
// Provides a unified interface that can switch between
// IndexedDB (current) and Cache Service (new) backends.
// Controlled by feature flag: USE_CACHE_SERVICE
// ============================================

import {
    checkCache as checkCacheIndexedDB,
    addToCache as addToCacheIndexedDB,
    findTopCacheMatches as findTopCacheMatchesIndexedDB,
    getCacheStats as getCacheStatsIndexedDB,
    getCacheEntries as getCacheEntriesIndexedDB,
    deleteCacheEntries as deleteCacheEntriesIndexedDB,
    exportCacheAsJSON as exportCacheAsJSONIndexedDB,
    acceptCacheHit as acceptCacheHitIndexedDB,
    clearProjectCache as clearProjectCacheIndexedDB,
    type CacheEntry,
    type CacheMatch,
} from './cache';

import {
    checkCacheFromService,
    addToCacheService,
} from './cacheServiceApi';

// Feature flag - set via environment variable
const USE_CACHE_SERVICE = import.meta.env.VITE_USE_CACHE_SERVICE === 'true';

/**
 * Universal cache check - routes to appropriate backend
 */
export async function checkCache(
    projectId: string,
    query: string
): Promise<{ hit: boolean; entry?: CacheEntry; similarity?: number; queryVector?: number[] }> {
    const session = await import('./session').then(m => m.getSession());
    const userId = session?.employeeId || 'unknown';

    if (USE_CACHE_SERVICE) {
        return checkCacheFromService(projectId, userId, query) as Promise<any>;
    } else {
        return checkCacheIndexedDB(projectId, query);
    }
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
    if (USE_CACHE_SERVICE) {
        return addToCacheService(projectId, employeeId, query, compressedPrompt, llmResponse, metrics) as Promise<any>;
    } else {
        return addToCacheIndexedDB(projectId, employeeId, query, compressedPrompt, llmResponse, metrics);
    }
}

// Re-export other functions (these will need service equivalents later)
export {
    findTopCacheMatchesIndexedDB as findTopCacheMatches,
    getCacheStatsIndexedDB as getCacheStats,
    getCacheEntriesIndexedDB as getCacheEntries,
    deleteCacheEntriesIndexedDB as deleteCacheEntries,
    exportCacheAsJSONIndexedDB as exportCacheAsJSON,
    acceptCacheHitIndexedDB as acceptCacheHit,
    clearProjectCacheIndexedDB as clearProjectCache,
};

export type { CacheEntry, CacheMatch };
