
// ============================================
// USER SERVICE API CLIENT
// ============================================
//
// Client wrapper for the FastAPI user/prompt service.
// Replaces IndexedDB calls with HTTP API calls.
// ============================================

const CACHE_SERVICE_URL = import.meta.env.VITE_CACHE_SERVICE_URL || 'http://localhost:8000';

export interface UserResponse {
    employee_id: string;
    full_name: string;
    project_name: string;
    registered_at: string;
}

export interface PromptActivityResponse {
    id: string;
    employee_id: string;
    project_id: string;
    query_text: string;
    timestamp: string;
    cached: boolean;
    rating?: number;
    rating_reason?: string;
}

// ------------------------------------------------------------------
// User Management
// ------------------------------------------------------------------

export async function registerUserApi(
    employeeId: string,
    fullName: string,
    projectName: string
): Promise<UserResponse | null> {
    try {
        const res = await fetch(`${CACHE_SERVICE_URL}/users/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employee_id: employeeId,
                full_name: fullName,
                project_name: projectName
            }),
        });
        if (!res.ok) throw new Error(`Registration failed: ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error('User registration error:', err);
        return null;
    }
}

export async function getUserApi(employeeId: string): Promise<UserResponse | null> {
    try {
        const res = await fetch(`${CACHE_SERVICE_URL}/users/${employeeId}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Get user failed: ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error('Get user error:', err);
        return null;
    }
}

// ------------------------------------------------------------------

export async function getAllUsersApi(limit = 100, offset = 0): Promise<UserResponse[]> {
    try {
        const res = await fetch(`${CACHE_SERVICE_URL}/users?limit=${limit}&offset=${offset}`);
        if (!res.ok) return [];
        return await res.json();
    } catch (err) {
        console.error('List users error:', err);
        return [];
    }
}

// ------------------------------------------------------------------
// Prompt History
// ------------------------------------------------------------------

export async function recordPromptActivityApi(
    employeeId: string,
    projectId: string,
    queryText: string,
    cached: boolean,
    rating?: number,
    ratingReason?: string
): Promise<PromptActivityResponse | null> {
    try {
        const res = await fetch(`${CACHE_SERVICE_URL}/prompts/activity`, {
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
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.error('Record activity error:', err);
        return null;
    }
}

export async function getPromptHistoryApi(employeeId: string, limit = 100): Promise<PromptActivityResponse[]> {
    try {
        const res = await fetch(`${CACHE_SERVICE_URL}/prompts/history?employee_id=${employeeId}&limit=${limit}`);
        if (!res.ok) return [];
        return await res.json();
    } catch (err) {
        console.error('Get history error:', err);
        return [];
    }
}
