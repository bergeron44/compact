import * as CacheService from "@/lib/cacheServiceApi";
import * as UserService from "@/lib/userServiceApi";

export const testAddUser = async () => {
    console.log("Testing Add User...");
    try {
        const user = await UserService.registerUserApi("TEST001", "Test User", "Project Alpha");
        if (user) console.log("✅ User registered:", user);
        else console.error("❌ Failed to register user");
    } catch (e) {
        console.error("❌ Error registering user:", e);
    }
};

export const testGetUser = async (id: string) => {
    console.log(`Testing Get User (${id})...`);
    try {
        const user = await UserService.getUserApi(id);
        if (user) console.log("✅ User found:", user);
        else console.warn("⚠️ User not found (might be expected)");
    } catch (e) {
        console.error("❌ Error getting user:", e);
    }
};

export const testGetAllUsers = async () => {
    console.log("Testing Get All Users (Skipped - API not exposed)");
    // Service doesn't expose list all users yet
};

export const testUpdateUser = async (id: string) => {
    console.log("Testing Update User (Skipped - API not exposed)");
};

export const testAddCache = async () => {
    console.log("Testing Add Cache...");
    const metrics = {
        originalTokens: 100,
        compressedTokens: 80,
        compressionPercentage: 20
    };
    try {
        const entry = await CacheService.addToCacheService(
            "project_alpha",
            "TEST001",
            "What is the capital of France?",
            "Capital France?",
            "Paris",
            metrics
        );
        if (entry) console.log("✅ Cache entry added:", entry);
        else console.error("❌ Failed to add cache entry");
    } catch (e) {
        console.error("❌ Error adding cache entry:", e);
    }
};

export const testGetCacheByProject = async (projectId: string) => {
    console.log(`Testing Get Cache for View (${projectId})...`);
    try {
        const entries = await CacheService.getCacheEntriesService(projectId);
        console.log(`✅ Found ${entries.length} entries`);
        if (entries.length > 0) console.log("Sample:", entries[0]);
    } catch (e) {
        console.error("❌ Error getting cache entries:", e);
    }
};

export const testUpdateCacheHitFirst = async () => {
    console.log("Testing Cache Hit Update...");
    // Simulate a hit
    const hit = await CacheService.checkCacheFromService("project_alpha", "TEST001", "What is the capital of France?");
    if (hit.hit) {
        console.log("✅ Cache Hit Success!", hit.entry);
    } else {
        console.warn("⚠️ Cache Miss (ensure entry was added first)");
    }
};

export const testGetCacheStats = async (projectId: string) => {
    console.log(`Testing Cache Stats (${projectId})...`);
    try {
        const stats = await CacheService.getCacheStatsService(projectId);
        console.log("✅ Stats:", stats);
    } catch (e) {
        console.error("❌ Error fetching stats:", e);
    }
};

export const testAddPrompt = async () => {
    console.log("Testing Add Prompt Activity...");
    try {
        await UserService.recordPromptActivityApi("TEST001", "project_alpha", "Test prompt activity", false, 5, "Good quality");
        console.log("✅ Prompt activity recorded");
    } catch (e) {
        console.error("❌ Error recording prompt activity:", e);
    }
};

export const testGetPromptsByEmployee = async (employeeId: string) => {
    console.log(`Testing Get User History (${employeeId})...`);
    try {
        const history = await UserService.getPromptHistoryApi(employeeId);
        console.log(`✅ Found ${history.length} history items`);
    } catch (e) {
        console.error("❌ Error fetching user history:", e);
    }
};

export const testExportData = async () => {
    console.log("Testing Export Data...");
    try {
        const json = await CacheService.exportCacheAsJSON("project_alpha");
        console.log("✅ Exported JSON length:", json.length);
    } catch (e) {
        console.error("❌ Error exporting data:", e);
    }
};

export const testMigration = async () => {
    console.log("Testing Service Health...");
    const health = await CacheService.checkCacheServiceHealth();
    if (health.available) console.log("✅ Service is Healthy");
    else console.error("❌ Service is Unreachable");
};

export const testClearAll = async () => {
    console.log("Testing Clear Cache...");
    await CacheService.clearProjectCacheService("project_alpha");
    console.log("✅ Clear command sent");
};
