import { localDB } from './storage/db';
import { ratePrompt } from './mockLLM';

// ============================================
// INTERFACES (kept for backward compat)
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
      rating: p.rating ?? 5,
      ratingReason: p.ratingReason ?? '',
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
  cached: boolean,
  rating?: number,
  ratingReason?: string,
): Promise<void> {
  // Use provided rating/reason (from filterAndRate), otherwise fall back to mock
  const { score, reason } =
    rating != null && ratingReason != null
      ? { score: rating, reason: ratingReason }
      : ratePrompt(queryText);
  await localDB.addPrompt({
    employeeId,
    projectId,
    queryText,
    cached,
    rating: score,
    ratingReason: reason,
  });
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
        if (p.timestamp > existing.lastUsed) {
          existing.lastUsed = p.timestamp;
          // Keep the most recent rating
          existing.rating = p.rating ?? existing.rating;
          existing.ratingReason = p.ratingReason ?? existing.ratingReason;
        }
      } else {
        promptMap.set(p.queryText, {
          text: p.queryText,
          vector: [],
          frequency: 1,
          lastUsed: p.timestamp,
          rating: p.rating ?? 5,
          ratingReason: p.ratingReason ?? '',
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
 * Improved local embedding fallback (128 dimensions).
 *
 * Uses two feature sets for robust similarity:
 *   • Dims  0–63: word unigrams (semantic matching)
 *   • Dims 64–127: character trigrams (fuzzy / morphological matching)
 *
 * This makes "What is RAG?" highly similar to "rag pls explain" because
 * they share words and character n-grams, while the higher dimensionality
 * reduces accidental collisions.
 *
 * NOTE: Existing cache entries with old 8-dim vectors are skipped
 * automatically by the dimension-mismatch guard in cache lookups.
 */
export function textToVector(text: string): number[] {
  const DIM = 128;
  const WORD_DIM = 64;   // first half for words
  // char-trigram half = DIM - WORD_DIM = 64

  const normalised = text.toLowerCase().replace(/[^\w\s]/g, '');
  const words = normalised.split(/\s+/).filter(Boolean);
  const vec = new Array(DIM).fill(0);

  // ── Word features (dims 0–63) ────────────────────────────────
  for (const w of words) {
    const slot = djb2(w) % WORD_DIM;
    vec[slot] += 1;
  }

  // ── Character trigram features (dims 64–127) ─────────────────
  const flat = normalised.replace(/\s+/g, ' ').trim();
  for (let i = 0; i <= flat.length - 3; i++) {
    const tri = flat.slice(i, i + 3);
    const slot = WORD_DIM + (djb2(tri) % (DIM - WORD_DIM));
    vec[slot] += 1;
  }

  // ── L2 normalise ─────────────────────────────────────────────
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
