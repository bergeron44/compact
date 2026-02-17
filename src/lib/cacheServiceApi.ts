// ============================================
// CACHE SERVICE API CLIENT
// ============================================
//
// Client wrapper for the FastAPI cache service.
// Replaces IndexedDB calls with HTTP API calls.
// NOW INCLUDES ALL COMPRESSION METRICS!
// ============================================

import { type CacheEntry } from './cache';

const CACHE_SERVICE_URL = import.meta.env.VITE_CACHE_SERVICE_URL || 'http://localhost:8001';

interface CacheLookupResponse {
    found: boolean;
    results: Array<{
        key: string;  // queryText
        value: string;  // llmResponse
        score: number;  // similarity
        compressed_prompt: string;
        compression_ratio: number;
        original_tokens: number;
        compressed_tokens: number;
        hit_count: number;
        created_at: string;
        last_accessed: string;
        employee_id: string;
    }>;
}

interface CacheInsertRequest {
    project_id: string;
    user_id: string;
    prompt: string;
    response: string;
    // Compression metrics - REQUIRED!
    compressed_prompt: string;
    compression_ratio: number;
    original_tokens: number;
    compressed_tokens: number;
}

interface CacheInsertResponse {
    stored_entries: Array<{
        key: string;
        value: string;
    }>;
}

/**
 * Check if a query exists in the cache.
 * Returns the top matching entry with ALL metadata.
 */
export async function checkCacheFromService(
    projectId: string,
    userId: string,
    query: string
): Promise<{ hit: boolean; entry?: CacheEntry; similarity?: number }> {
    try {
        const res = await fetch(`${CACHE_SERVICE_URL}/cache/lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId,
                user_id: userId,
                prompt: query,
            }),
        });

        if (!res.ok) {
            console.warn(`Cache lookup failed: ${res.status}`);
            return { hit: false };
        }

        const data: CacheLookupResponse = await res.json();

        if (data.found && data.results.length > 0) {
            const result = data.results[0];

            // Map service response to full CacheEntry with ALL fields
            const entry: CacheEntry = {
                queryText: result.key,
                llmResponse: result.value,
                compressedPrompt: result.compressed_prompt,
                compressionRatio: result.compression_ratio,
                originalTokens: result.original_tokens,
                compressedTokens: result.compressed_tokens,
                hitCount: result.hit_count,
                vector: [],  // Not returned by API (too large)
                createdAt: result.created_at,
                lastAccessed: result.last_accessed,
                employeeId: result.employee_id,
            };

            return {
                hit: true,
                entry,
                similarity: result.score,
            };
        }

        return { hit: false };
    } catch (err) {
        console.error('Cache service unreachable:', err);
        return { hit: false };
    }
}

/**
 * Add a new entry to the cache with FULL compression metrics.
 */
export async function addToCacheService(
    projectId: string,
    userId: string,
    query: string,
    compressedPrompt: string,
    response: string,
    metrics: {
        originalTokens: number;
        compressedTokens: number;
        compressionPercentage: number;
    }
): Promise<CacheEntry | null> {
    try {
        const requestData: CacheInsertRequest = {
            project_id: projectId,
            user_id: userId,
            prompt: query,
            response: response,
            compressed_prompt: compressedPrompt,
            compression_ratio: Math.round(metrics.compressionPercentage),
            original_tokens: metrics.originalTokens,
            compressed_tokens: metrics.compressedTokens,
        };

        const res = await fetch(`${CACHE_SERVICE_URL}/cache/insert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData),
        });

        if (!res.ok) {
            console.warn(`Cache insert failed: ${res.status}`);
            return null;
        }

        const data: CacheInsertResponse = await res.json();

        if (data.stored_entries.length > 0) {
            // Return full CacheEntry matching IndexedDB structure
            return {
                queryText: query,
                llmResponse: response,
                compressedPrompt: compressedPrompt,
                compressionRatio: Math.round(metrics.compressionPercentage),
                originalTokens: metrics.originalTokens,
                compressedTokens: metrics.compressedTokens,
                hitCount: 1,
                vector: [],  // Not stored client-side
                createdAt: new Date().toISOString(),
                lastAccessed: new Date().toISOString(),
                employeeId: userId,
            };
        }

        return null;
    } catch (err) {
        console.error('Cache service unreachable:', err);
        return null;
    }
}

/**
 * Check if the cache service is healthy.
 */
export async function checkCacheServiceHealth(): Promise<{ available: boolean }> {
    try {
        const res = await fetch(`${CACHE_SERVICE_URL}/health`);
        if (!res.ok) return { available: false };
        return { available: true };
    } catch {
        return { available: false };
    }
}
