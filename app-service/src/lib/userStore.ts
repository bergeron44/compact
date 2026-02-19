import {
  registerUserApi,
  getUserApi,
  getAllUsersApi,
  recordPromptActivityApi,
  getPromptHistoryApi
} from './userServiceApi';
import { ratePrompt } from './mockLLM';

// ============================================
// INTERFACES
// ============================================

export interface UserPromptEntry {
  text: string;
  vector: number[];
  frequency: number;
  lastUsed: string;
  /** Mock-LLM quality rating (1–10) */
  rating: number;
  /** Human-readable reason for the rating */
  ratingReason: string;
}

export interface OrgUser {
  employeeId: string;
  fullName: string;
  projectName: string;
  prompts: UserPromptEntry[];
  registeredAt: string;
}

// ============================================
// USER OPERATIONS (Service-based)
// ============================================

export async function findUserByEmployeeId(employeeId: string): Promise<OrgUser | null> {
  const user = await getUserApi(employeeId);
  if (!user) return null;

  // Fetch history to construct the full OrgUser object
  const history = await getPromptHistoryApi(employeeId, 1000); // Fetch enough history

  // Aggregate history into UserPromptEntry format (frequency, etc.)
  const promptMap = new Map<string, UserPromptEntry>();

  for (const item of history) {
    // History is sorted desc by timestamp, so iterating gives us latest first?
    // Actually our API returns desc sort.

    if (!promptMap.has(item.query_text)) {
      promptMap.set(item.query_text, {
        text: item.query_text,
        vector: [], // vectors are server-side now
        frequency: 0,
        lastUsed: item.timestamp,
        rating: item.rating ?? 5,
        ratingReason: item.rating_reason ?? '',
      });
    }

    // Update aggregate stats
    const entry = promptMap.get(item.query_text)!;
    entry.frequency += 1;
    // Since we iterate desc, the first time we see it is the latest timestamp.
    // So we don't need to manually check max(lastUsed).
  }

  return {
    employeeId: user.employee_id,
    fullName: user.full_name,
    projectName: user.project_name,
    registeredAt: user.registered_at,
    prompts: Array.from(promptMap.values()),
  };
}

export async function registerUser(
  employeeId: string,
  fullName: string,
  projectName: string
): Promise<OrgUser> {
  const user = await registerUserApi(employeeId, fullName, projectName);
  if (!user) {
    throw new Error('Registration failed (Service unavailable)');
  }
  return {
    employeeId: user.employee_id,
    fullName: user.full_name,
    projectName: user.project_name,
    prompts: [],
    registeredAt: user.registered_at,
  };
}

export async function addUserPrompt(
  employeeId: string,
  projectId: string,
  queryText: string,
  cached: boolean,
  rating?: number,
  ratingReason?: string,
): Promise<void> {
  // Use provided rating/reason (from filterAndRate), otherwise fall back to mock
  const { score, reason } =
    rating != null && ratingReason != null
      ? { score: rating, reason: ratingReason }
      : ratePrompt(queryText);

  await recordPromptActivityApi(
    employeeId,
    projectId,
    queryText,
    cached,
    score,
    reason
  );
}

// Retained for compatibility, this now fetches real users from the service
export async function getAllOrgUsers(): Promise<OrgUser[]> {
  try {
    const apiUsers = await getAllUsersApi(100); // Limit 100 for now

    // We need to fetch history for each user to populate 'prompts'.
    // Parallel fetch is okay for small N. For large N, we should optimize backend.
    const promises = apiUsers.map(async (u) => {
      const history = await getPromptHistoryApi(u.employee_id, 100);

      const promptMap = new Map<string, UserPromptEntry>();
      for (const item of history) {
        if (!promptMap.has(item.query_text)) {
          promptMap.set(item.query_text, {
            text: item.query_text,
            vector: [],
            frequency: 0,
            lastUsed: item.timestamp,
            rating: item.rating ?? 5,
            ratingReason: item.rating_reason ?? '',
          });
        }
        const entry = promptMap.get(item.query_text)!;
        entry.frequency += 1;
      }

      return {
        employeeId: u.employee_id,
        fullName: u.full_name,
        projectName: u.project_name,
        registeredAt: u.registered_at,
        prompts: Array.from(promptMap.values()),
      };
    });

    return await Promise.all(promises);
  } catch (err) {
    console.warn("getAllOrgUsers failed:", err);
    return [];
  }
}

// ============================================
// VECTOR UTILITIES
// ============================================
// Kept for compatibility if anything imports them, though likely unused.

export function textToVector(text: string): number[] {
  return []; // Stub
}

export function cosineSimilarity(a: number[], b: number[]): number {
  return 0; // Stub
}
