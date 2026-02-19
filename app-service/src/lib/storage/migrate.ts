import { checkCacheServiceHealth } from "@/lib/cacheServiceApi";

export async function migrateToIndexedDB() {
    // Migration is no longer needed as we are using the centralized service.
    // We will just verify the service is available.
    const health = await checkCacheServiceHealth();
    if (health.available) {
        console.log("[Migration] Service is available. Legacy migration skipped.");
    } else {
        console.warn("[Migration] Service is UNAVAILABLE. App may not function correctly.");
    }
}
