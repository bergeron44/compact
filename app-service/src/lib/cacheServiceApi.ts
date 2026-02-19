// ============================================
// CACHE SERVICE API CLIENT
// ============================================
//
// Client wrapper for the FastAPI cache service.
// Replaces IndexedDB calls with HTTP API calls.
// NOW INCLUDES ALL COMPRESSION METRICS!
// ============================================

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
    /** Internal ID (number for IndexedDB, string for Service) */
    id?: string | number;
    likes?: number;
    dislikes?: number;
}

export interface CacheMatch {
    entry: CacheEntry;
    similarity: number;
    /** Internal DB id – used by acceptCacheHit */
    _dbId: string | number;
}

const CACHE_SERVICE_URL = import.meta.env.VITE_CACHE_SERVICE_URL || 'http://localhost:8000';

interface CacheLookupResponse {
    found: boolean;
    results: Array<{
        entry_id: string;
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
        likes: number;
        dislikes: number;
    }>;
}

interface CacheStatsResponse {
    project_id: string;
    total_entries: number;
    total_hits: number;
    avg_compression: number;
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
                limit: 1,
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
                id: result.entry_id,
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
                likes: result.likes,
                dislikes: result.dislikes,
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

// Fixed syntax error here

export async function incrementCacheHitService(projectId: string, entryId: string | number) {
    try {
        await fetch(`${CACHE_SERVICE_URL}/cache/hit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId,
                entry_id: String(entryId)
            }),
        });
    } catch (err) {
        console.error('Increment hit error:', err);
    }
}

export async function checkCacheServiceHealth(): Promise<{ available: boolean }> {
    try {
        const res = await fetch(`${CACHE_SERVICE_URL}/health`);
        if (!res.ok) return { available: false };
        return { available: true };
    } catch {
        return { available: false };
    }
}

export async function findTopCacheMatchesService(
    projectId: string,
    query: string,
    limit = 5,
    threshold = 0
): Promise<{ matches: CacheMatch[]; queryVector: number[] }> {
    try {
        // We only pass basic user_id "unknown" here as it's a search, not a user-specific action
        const res = await fetch(`${CACHE_SERVICE_URL}/cache/lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId,
                user_id: 'search',
                prompt: query,
                limit: limit,
                threshold: threshold
            }),
        });

        if (!res.ok) return { matches: [], queryVector: [] };

        const data: CacheLookupResponse = await res.json();
        const matches: CacheMatch[] = data.results.map(r => ({
            entry: {
                id: r.entry_id,
                queryText: r.key,
                llmResponse: r.value,
                compressedPrompt: r.compressed_prompt,
                compressionRatio: r.compression_ratio,
                originalTokens: r.original_tokens,
                compressedTokens: r.compressed_tokens,
                hitCount: r.hit_count,
                vector: [],
                createdAt: r.created_at,
                lastAccessed: r.last_accessed,
                employeeId: r.employee_id,
                likes: r.likes,
                dislikes: r.dislikes,
            },
            similarity: r.score,
            _dbId: r.entry_id, // String UUID
        }));

        return { matches, queryVector: [] }; // Service handles vector logic
    } catch (err) {
        console.error('Cache service match error:', err);
        return { matches: [], queryVector: [] };
    }
}

export async function getCacheStatsService(projectId: string) {
    try {
        const res = await fetch(`${CACHE_SERVICE_URL}/cache/stats?project_id=${projectId}`);
        if (!res.ok) return { totalQueries: 0, totalHits: 0, hitRate: 0, avgCompression: 0 };
        const data: CacheStatsResponse = await res.json();

        // Map to expected format
        const totalQueries = data.total_entries;
        // Total hits (re-uses) = sum(times_accessed) - unique_entries
        // If times_accessed starts at 1.
        // But let's assume raw hits for now from service sum.
        // Service `total_hits` is sum(times_accessed).
        // So re-uses = data.total_hits - data.total_entries.
        const reUseHits = Math.max(0, data.total_hits - data.total_entries);
        const hitRate = data.total_hits > 0
            ? Math.round((reUseHits / data.total_hits) * 100)
            : 0;

        return {
            totalQueries: totalQueries,
            totalHits: reUseHits,
            hitRate: hitRate,
            avgCompression: Math.round(data.avg_compression)
        };
    } catch (err) {
        return { totalQueries: 0, totalHits: 0, hitRate: 0, avgCompression: 0 };
    }
}

export async function getCacheEntriesService(projectId: string): Promise<CacheEntry[]> {
    try {
        const res = await fetch(`${CACHE_SERVICE_URL}/cache/entries?project_id=${projectId}&limit=1000`);
        if (!res.ok) return [];
        const data: CacheLookupResponse['results'] = await res.json(); // Reusing result item structure

        return data.map(r => ({
            id: r.entry_id,
            queryText: r.key,
            llmResponse: r.value,
            compressedPrompt: r.compressed_prompt,
            compressionRatio: r.compression_ratio,
            originalTokens: r.original_tokens,
            compressedTokens: r.compressed_tokens,
            hitCount: r.hit_count,
            vector: [],
            createdAt: r.created_at,
            lastAccessed: r.last_accessed,
            employeeId: r.employee_id,
            likes: r.likes,
            dislikes: r.dislikes,
        }));
    } catch (err) {
        console.error('List entries error:', err);
        return [];
    }
}

export async function deleteCacheEntriesService(projectId: string, ids: (string | number)[]) {
    try {
        // Service only accepts string UUIDs
        const stringIds = ids.map(id => String(id));
        await fetch(`${CACHE_SERVICE_URL}/cache/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId,
                entry_ids: stringIds
            }),
        });
    } catch (err) {
        console.error('Delete entries error:', err);
    }
}

export async function clearProjectCacheService(projectId: string) {
    try {
        await fetch(`${CACHE_SERVICE_URL}/cache/clear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId,
            }),
        });
    } catch (err) {
        console.error('Clear cache error:', err);
    }
}

export async function recordPromptActivityService(
    employeeId: string,
    projectId: string,
    queryText: string,
    cached: boolean,
    rating?: number,
    ratingReason?: string
) {
    try {
        await fetch(`${CACHE_SERVICE_URL}/prompts/activity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employee_id: employeeId,
                project_id: projectId,
                query_text: queryText,
                cached: cached,
                rating: rating,
                rating_reason: ratingReason
            }),
        });
    } catch (err) {
        console.error('Record activity error:', err);
    }
}

export async function voteCacheEntryService(
    projectId: string,
    entryId: string | number,
    voteType: 'like' | 'dislike'
): Promise<{ likes: number; dislikes: number }> {
    try {
        const res = await fetch(`${CACHE_SERVICE_URL}/cache/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId,
                entry_id: String(entryId),
                vote_type: voteType
            }),
        });
        if (!res.ok) return { likes: 0, dislikes: 0 };
        return await res.json();
    } catch (err) {
        console.error('Vote error:', err);
        return { likes: 0, dislikes: 0 };
    }
}
