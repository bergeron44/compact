import { localDB } from './storage/db';

// ============================================
// INTERFACES (kept for backward compat)
// ============================================

export interface UserPromptEntry {
  text: string;
  vector: number[];
  frequency: number;
  lastUsed: string;
}

export interface OrgUser {
  employeeId: string;
  fullName: string;
  projectName: string;
  prompts: UserPromptEntry[];
  registeredAt: string;
}

// ============================================
// USER OPERATIONS (async / IndexedDB)
// ============================================

export async function findUserByEmployeeId(employeeId: string): Promise<OrgUser | null> {
  const user = await localDB.getUser(employeeId);
  if (!user) return null;
  const promptRecords = await localDB.getPromptsByEmployee(employeeId);
  return {
    employeeId: user.employeeId,
    fullName: user.fullName,
    projectName: user.projectName,
    registeredAt: user.registeredAt,
    prompts: promptRecords.map((p) => ({
      text: p.queryText,
      vector: [],
      frequency: 1,
      lastUsed: p.timestamp,
    })),
  };
}

export async function registerUser(
  employeeId: string,
  fullName: string,
  projectName: string
): Promise<OrgUser> {
  const existing = await localDB.getUser(employeeId);
  if (existing) {
    throw new Error('Employee ID already registered');
  }
  await localDB.addUser({ employeeId, fullName, projectName });
  return {
    employeeId,
    fullName,
    projectName,
    prompts: [],
    registeredAt: new Date().toISOString(),
  };
}

export async function addUserPrompt(
  employeeId: string,
  projectId: string,
  queryText: string,
  cached: boolean
): Promise<void> {
  await localDB.addPrompt({ employeeId, projectId, queryText, cached });
}

export async function getAllOrgUsers(): Promise<OrgUser[]> {
  const users = await localDB.getAllUsers();
  const result: OrgUser[] = [];
  for (const u of users) {
    const promptRecords = await localDB.getPromptsByEmployee(u.employeeId);
    // aggregate frequency for similar prompts
    const promptMap = new Map<string, UserPromptEntry>();
    for (const p of promptRecords) {
      const existing = promptMap.get(p.queryText);
      if (existing) {
        existing.frequency += 1;
        existing.lastUsed = p.timestamp > existing.lastUsed ? p.timestamp : existing.lastUsed;
      } else {
        promptMap.set(p.queryText, {
          text: p.queryText,
          vector: [],
          frequency: 1,
          lastUsed: p.timestamp,
        });
      }
    }
    result.push({
      employeeId: u.employeeId,
      fullName: u.fullName,
      projectName: u.projectName,
      prompts: Array.from(promptMap.values()),
      registeredAt: u.registeredAt,
    });
  }
  return result;
}

// ============================================
// VECTOR UTILITIES (semantic cache)
// ============================================

/** djb2 hash for string → number */
function djb2(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
  }
  return h >>> 0;
}

/**
 * Word-hash embedding: each word maps to a dimension via djb2.
 * Different word sets → different vectors. Same/similar words → high cosine similarity.
 * Keeps 8 dimensions for backward compatibility with existing cache entries.
 */
export function textToVector(text: string): number[] {
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  const dim = 8;
  const vec = new Array(dim).fill(0);
  for (const w of words) {
    const slot = djb2(w) % dim;
    vec[slot] += 1;
  }
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => Math.round((v / mag) * 1000) / 1000);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
