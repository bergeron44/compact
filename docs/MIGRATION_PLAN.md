# Migration Plan: localStorage → IndexedDB + Real LLM Integration

## Executive Summary

### Current State
- **Storage:** localStorage (5-10MB limit)
- **LLM:** Mock responses (keyword matching)
- **Embeddings:** Simple hash-based vectors (8 dimensions)
- **Compression:** Client-side extractive (first 50% of sentences)
- **Cache:** Semantic matching via cosine similarity (threshold 0.85). Note: `projectId` equals `session.employeeId` throughout the codebase.

### Target State
- **Storage:** IndexedDB (50MB-unlimited)
- **LLM:** Anthropic Claude Sonnet 4 (real API)
- **Embeddings:** TensorFlow.js Universal Sentence Encoder (512 dimensions)
- **Compression:** Enhanced multi-stage pipeline
- **Cache:** Semantic similarity (cosine > 0.88)

### Benefits of Migration
| Feature | Before | After | Improvement |
|---------|--------|-------|-------------|
| Storage Capacity | 5-10MB | 50MB-Unlimited | 10-100x |
| Query Speed | O(n) linear scan | O(log n) indexed | 100-1000x |
| LLM Quality | Keyword match | Real Claude | ∞ |
| Cache Hit Rate | ~20% (hash vectors) | ~60% (semantic) | 3x |
| Offline Support | Limited | Full | ✅ |

---

## Phase 1: IndexedDB Migration (Week 1)

### 1.1 Install Dependencies

```bash
# Install IndexedDB wrapper
npm install idb

# Install types
npm install --save-dev @types/idb
```

Update [package.json](package.json):

```json
{
  "dependencies": {
    "idb": "^8.0.0"
  }
}
```

---

### 1.2 Create Storage Layer

#### **NEW FILE:** `src/lib/storage/db.ts`

**Purpose:** Centralized IndexedDB wrapper with schema definitions

**Full Code:**

```typescript
import { openDB, DBSchema, IDBPDatabase } from 'idb';

// ============================================
// DATABASE SCHEMA DEFINITION
// ============================================

export interface CompactDB extends DBSchema {
  users: {
    key: string;
    value: {
      employeeId: string;
      fullName: string;
      projectName: string;
      registeredAt: string;
      lastLogin?: string;
    };
    indexes: {
      'by-name': string;
      'by-project': string;
    };
  };

  cache: {
    key: number;
    value: {
      id?: number;
      projectId: string;
      employeeId: string;
      queryText: string;
      llmResponse: string;
      compressedResponse: string;
      embedding: number[];
      hitCount: number;
      compressionRatio: number;
      originalTokens: number;
      compressedTokens: number;
      createdAt: string;
      lastAccessed: string;
    };
    indexes: {
      'by-project': string;
      'by-employee': string;
      'by-query': string;
      'by-date': string;
    };
  };

  prompts: {
    key: number;
    value: {
      id?: number;
      employeeId: string;
      projectId: string;
      queryText: string;
      timestamp: string;
      cached: boolean;
      responseTime?: number;
    };
    indexes: {
      'by-employee': string;
      'by-project': string;
      'by-date': string;
    };
  };
}

// ============================================
// DATABASE CLASS
// ============================================

interface UserValue {
  employeeId: string;
  fullName: string;
  projectName: string;
  registeredAt: string;
  lastLogin?: string;
}

interface CacheValue {
  projectId: string;
  employeeId: string;
  queryText: string;
  llmResponse: string;
  compressedResponse: string;
  embedding: number[];
  hitCount: number;
  compressionRatio: number;
  originalTokens: number;
  compressedTokens: number;
  createdAt: string;
  lastAccessed: string;
}

interface PromptValue {
  employeeId: string;
  projectId: string;
  queryText: string;
  timestamp: string;
  cached: boolean;
  responseTime?: number;
}

class LocalDatabase {
  private db: IDBPDatabase<CompactDB> | null = null;
  private readonly DB_NAME = 'dell-compact-db';
  private readonly DB_VERSION = 1;

  async init(): Promise<void> {
    if (this.db) return;

    this.db = await openDB<CompactDB>(this.DB_NAME, this.DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (!db.objectStoreNames.contains('users')) {
          const usersStore = db.createObjectStore('users', { keyPath: 'employeeId' });
          usersStore.createIndex('by-name', 'fullName');
          usersStore.createIndex('by-project', 'projectName');
        }

        if (!db.objectStoreNames.contains('cache')) {
          const cacheStore = db.createObjectStore('cache', {
            keyPath: 'id',
            autoIncrement: true,
          });
          cacheStore.createIndex('by-project', 'projectId');
          cacheStore.createIndex('by-employee', 'employeeId');
          cacheStore.createIndex('by-query', 'queryText');
          cacheStore.createIndex('by-date', 'createdAt');
        }

        if (!db.objectStoreNames.contains('prompts')) {
          const promptsStore = db.createObjectStore('prompts', {
            keyPath: 'id',
            autoIncrement: true,
          });
          promptsStore.createIndex('by-employee', 'employeeId');
          promptsStore.createIndex('by-project', 'projectId');
          promptsStore.createIndex('by-date', 'timestamp');
        }
      },
    });
  }

  private async ensureInit(): Promise<void> {
    if (!this.db) await this.init();
  }

  async addUser(user: Omit<UserValue, 'registeredAt'>): Promise<string> {
    await this.ensureInit();
    const userWithTimestamp: UserValue = {
      ...user,
      registeredAt: new Date().toISOString(),
    };
    await this.db!.add('users', userWithTimestamp);
    return user.employeeId;
  }

  async getUser(employeeId: string): Promise<UserValue | undefined> {
    await this.ensureInit();
    return await this.db!.get('users', employeeId);
  }

  async updateUserLogin(employeeId: string): Promise<void> {
    await this.ensureInit();
    const user = await this.getUser(employeeId);
    if (user) {
      user.lastLogin = new Date().toISOString();
      await this.db!.put('users', user);
    }
  }

  async getAllUsers(): Promise<UserValue[]> {
    await this.ensureInit();
    return await this.db!.getAll('users');
  }

  async addToCache(entry: Omit<CacheValue, 'hitCount' | 'createdAt' | 'lastAccessed'>): Promise<IDBValidKey> {
    await this.ensureInit();
    const cacheEntry: CacheValue = {
      ...entry,
      hitCount: 1,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
    };
    return await this.db!.add('cache', cacheEntry);
  }

  async getCacheEntry(id: number): Promise<CacheValue & { id: number } | undefined> {
    await this.ensureInit();
    return await this.db!.get('cache', id);
  }

  async getCacheByProject(projectId: string): Promise<(CacheValue & { id: number })[]> {
    await this.ensureInit();
    return await this.db!.getAllFromIndex('cache', 'by-project', projectId);
  }

  async getCacheByEmployee(employeeId: string): Promise<(CacheValue & { id: number })[]> {
    await this.ensureInit();
    return await this.db!.getAllFromIndex('cache', 'by-employee', employeeId);
  }

  async updateCacheHit(id: number): Promise<void> {
    await this.ensureInit();
    const entry = await this.getCacheEntry(id);
    if (entry) {
      entry.hitCount++;
      entry.lastAccessed = new Date().toISOString();
      await this.db!.put('cache', entry);
    }
  }

  async deleteCache(id: number): Promise<void> {
    await this.ensureInit();
    await this.db!.delete('cache', id);
  }

  async clearCacheForProject(projectId: string): Promise<void> {
    await this.ensureInit();
    const entries = await this.getCacheByProject(projectId);
    const tx = this.db!.transaction('cache', 'readwrite');
    await Promise.all(entries.map((e) => tx.store.delete(e.id!)));
    await tx.done;
  }

  async addPrompt(prompt: Omit<PromptValue, 'timestamp'>): Promise<IDBValidKey> {
    await this.ensureInit();
    const promptWithTimestamp: PromptValue & { timestamp: string } = {
      ...prompt,
      timestamp: new Date().toISOString(),
    };
    return await this.db!.add('prompts', promptWithTimestamp);
  }

  async getPromptsByEmployee(employeeId: string): Promise<(PromptValue & { id: number })[]> {
    await this.ensureInit();
    return await this.db!.getAllFromIndex('prompts', 'by-employee', employeeId);
  }

  async getPromptsByProject(projectId: string): Promise<(PromptValue & { id: number })[]> {
    await this.ensureInit();
    return await this.db!.getAllFromIndex('prompts', 'by-project', projectId);
  }

  async getCacheStats(projectId: string): Promise<{
    totalQueries: number;
    totalHits: number;
    hitRate: number;
    avgCompression: number;
  }> {
    await this.ensureInit();
    const entries = await this.getCacheByProject(projectId);
    const totalQueries = entries.length;
    const totalHits = entries.reduce((sum, e) => sum + (e.hitCount - 1), 0);
    const hitRate = totalQueries > 0 ? Math.round((totalHits / (totalHits + totalQueries)) * 100) : 0;
    const avgCompression =
      totalQueries > 0
        ? Math.round(entries.reduce((sum, e) => sum + e.compressionRatio, 0) / totalQueries)
        : 0;
    return { totalQueries, totalHits, hitRate, avgCompression };
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async deleteDatabase(): Promise<void> {
    await this.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async migrateFromLocalStorage(): Promise<void> {
    await this.ensureInit();

    const orgUsersData = localStorage.getItem('dell_compact_org_users');
    if (orgUsersData) {
      const orgUsers = JSON.parse(orgUsersData);
      for (const user of orgUsers) {
        const existing = await this.getUser(user.employeeId);
        if (!existing) {
          await this.addUser({
            employeeId: user.employeeId,
            fullName: user.fullName,
            projectName: user.projectName,
          });
        }
      }
    }

    const cacheData = localStorage.getItem('dell_compact_cache');
    if (cacheData) {
      const cache: Record<string, Array<{ queryText: string; llmResponse: string; compressedResponse: string; vector: number[]; compressionRatio: number; originalTokens: number; compressedTokens: number }>> = JSON.parse(cacheData);
      for (const projectId in cache) {
        for (const entry of cache[projectId]) {
          await this.addToCache({
            projectId,
            employeeId: projectId,
            queryText: entry.queryText,
            llmResponse: entry.llmResponse,
            compressedResponse: entry.compressedResponse,
            embedding: entry.vector || [],
            compressionRatio: entry.compressionRatio,
            originalTokens: entry.originalTokens,
            compressedTokens: entry.compressedTokens,
          });
        }
      }
    }
  }
}

export const localDB = new LocalDatabase();
localDB.init().catch(console.error);
```

---

### 1.3 Update Existing Files

#### **UPDATE FILE:** [src/lib/userStore.ts](src/lib/userStore.ts)

**Strategy:** Replace localStorage with IndexedDB. Keep `textToVector` and `cosineSimilarity` for Phase 1 (cache still uses hash vectors). Prompts move to separate table; `getAllOrgUsers` must aggregate prompts.

**Changes:**
- Add: `import { localDB } from './storage/db';`
- Replace `loadUsers`/`saveUsers` with async IndexedDB calls
- `findUserByEmployeeId(employeeId)` → async, returns `OrgUser | null` (join prompts from prompts table)
- `registerUser(employeeId, fullName, projectName)` → async
- `addUserPrompt(employeeId, projectId, promptText, cached)` → async, writes to prompts table
- `getAllOrgUsers()` → async, aggregates users + prompts from both stores

**Key snippet for `getAllOrgUsers` (joining prompts):**

```typescript
export async function getAllOrgUsers(): Promise<OrgUser[]> {
  const users = await localDB.getAllUsers();
  const result: OrgUser[] = [];
  for (const u of users) {
    const promptRecords = await localDB.getPromptsByEmployee(u.employeeId);
    const prompts: UserPromptEntry[] = promptRecords.map((p) => ({
      text: p.queryText,
      vector: [], // Phase 3 will populate
      frequency: 1,
      lastUsed: p.timestamp,
    }));
    result.push({
      employeeId: u.employeeId,
      fullName: u.fullName,
      projectName: u.projectName,
      prompts,
      registeredAt: u.registeredAt,
    });
  }
  return result;
}
```

---

#### **UPDATE FILE:** [src/lib/cache.ts](src/lib/cache.ts)

**Strategy:** Phase 1 preserves semantic matching with hash-based vectors (0.85). Map `entry.vector` to `embedding` in IndexedDB. Do NOT regress to exact text match.

**Changes:**
- Replace localStorage with `localDB`
- `checkCache(projectId, query)` → async. Load entries via `getCacheByProject(projectId)`, use existing `textToVector` and `cosineSimilarity` (from userStore) with `entry.embedding`, threshold 0.85
- `addToCache(projectId, query, response)` → async. Compute `compressText`, tokens, `textToVector(query)` as `embedding`, call `localDB.addToCache` with `employeeId: projectId`
- `getCacheStats`, `getCacheEntries`, `deleteCacheEntries`, `exportCacheAsJSON`, `clearProjectCache` → async, use localDB

**Key `checkCache` logic (preserve semantic):**

```typescript
export async function checkCache(
  projectId: string,
  query: string
): Promise<{ hit: boolean; entry?: CacheEntry; similarity?: number }> {
  const entries = await localDB.getCacheByProject(projectId);
  const queryVector = textToVector(query);

  for (const entry of entries) {
    const emb = entry.embedding.length ? entry.embedding : entry.vector;
    if (!emb?.length) continue;
    const sim = cosineSimilarity(queryVector, emb);
    if (sim > 0.85) {
      await localDB.updateCacheHit(entry.id!);
      return {
        hit: true,
        entry: {
          queryText: entry.queryText,
          llmResponse: entry.llmResponse,
          compressedResponse: entry.compressedResponse,
          hitCount: entry.hitCount + 1,
          compressionRatio: entry.compressionRatio,
          originalTokens: entry.originalTokens,
          compressedTokens: entry.compressedTokens,
          vector: emb,
          createdAt: entry.createdAt,
          lastAccessed: new Date().toISOString(),
        },
        similarity: sim,
      };
    }
  }
  return { hit: false };
}
```

---

#### **UPDATE FILE:** [src/lib/session.ts](src/lib/session.ts)

**No changes.** Session remains in localStorage (small, temporary).

---

### 1.4 Update React Components

#### **UPDATE FILE:** [src/pages/Chat.tsx](src/pages/Chat.tsx)

**Changes:**
- `checkCache` and `addToCache` are async; add `await`
- `addUserPrompt` becomes async with `projectId` and `cached`; add `await`
- Use existing names: `input`, `loading`, `session.employeeId` as `projectId`

**Find (lines 47-76):**

```typescript
const cached = checkCache(session.employeeId, query);

if (cached.hit && cached.entry) {
  // ...
  addUserPrompt(session.employeeId, query);
  // ...
} else {
  const response = await simulateLLMResponse(query);
  const entry = addToCache(session.employeeId, query, response);
  addUserPrompt(session.employeeId, query);
  // ...
}
```

**Replace with:**

```typescript
const cached = await checkCache(session.employeeId, query);

if (cached.hit && cached.entry) {
  // ...
  await addUserPrompt(session.employeeId, session.projectName, query, true);
  // ...
} else {
  const response = await simulateLLMResponse(query);
  const entry = await addToCache(session.employeeId, query, response);
  await addUserPrompt(session.employeeId, session.projectName, query, false);
  // ...
}
```

---

#### **UPDATE FILE:** [src/pages/Login.tsx](src/pages/Login.tsx)

**Changes:**
- `findUserByEmployeeId` and `registerUser` become async
- `handleLogin` and `handleRegister` use `async/await`
- Use `regId`, `regName`, `regProject` (current variable names)

**Find `handleLogin` (lines 24-44):**

```typescript
const handleLogin = () => {
  // ...
  const user = findUserByEmployeeId(loginId.trim());
  // ...
};
```

**Replace with:**

```typescript
const handleLogin = async () => {
  const errors: Record<string, string> = {};
  if (!loginId.trim()) errors.id = "Employee ID is required";
  else if (!/^\d+$/.test(loginId)) errors.id = "Employee ID must be numeric";
  setLoginErrors(errors);
  if (Object.keys(errors).length > 0) return;

  const user = await findUserByEmployeeId(loginId.trim());
  if (!user) {
    setLoginErrors({ id: "Employee ID not found. Please register first." });
    return;
  }
  // ... rest unchanged
};
```

**Find `handleRegister` (lines 46-66):**

```typescript
const handleRegister = () => {
  // ...
  try {
    const user = registerUser(regId.trim(), regName.trim(), regProject.trim());
    // ...
  }
};
```

**Replace with:**

```typescript
const handleRegister = async () => {
  const errors: Record<string, string> = {};
  if (!regId.trim()) errors.id = "Employee ID is required";
  else if (!/^\d+$/.test(regId)) errors.id = "Employee ID must be numeric";
  if (!regName.trim()) errors.name = "Full name is required";
  if (!regProject.trim()) errors.project = "Project name is required";
  setRegErrors(errors);
  if (Object.keys(errors).length > 0) return;

  try {
    const user = await registerUser(regId.trim(), regName.trim(), regProject.trim());
    saveSession({
      name: user.fullName,
      employeeId: user.employeeId,
      projectName: user.projectName,
      loginTimestamp: new Date().toISOString(),
    });
    navigate("/chat");
  } catch (e: unknown) {
    setRegErrors({ id: (e as Error).message });
  }
};
```

---

#### **UPDATE FILE:** [src/pages/CacheDashboard.tsx](src/pages/CacheDashboard.tsx)

**Changes:**
- Replace sync `getCacheStats(projectId)` and `getCacheEntries(projectId)` with async
- Add `useState` for `allEntries`, `stats`, `loading`
- Add `useEffect` to load data when `session?.employeeId` is available

**Find (lines 79-82):**

```typescript
const _rk = refreshKey;
const stats = getCacheStats(projectId);
const allEntries = getCacheEntries(projectId);
```

**Replace with:**

```typescript
const [stats, setStats] = useState<{ totalQueries: number; totalHits: number; hitRate: number; avgCompression: number } | null>(null);
const [allEntries, setAllEntries] = useState<CacheEntry[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  if (!projectId) return;
  let cancelled = false;
  (async () => {
    setLoading(true);
    try {
      const [s, entries] = await Promise.all([
        getCacheStats(projectId),
        getCacheEntries(projectId),
      ]);
      if (!cancelled) {
        setStats(s);
        setAllEntries(entries);
      }
    } finally {
      if (!cancelled) setLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, [projectId, refreshKey]);
```

Update `deleteCacheEntries` and `handleDeleteSelected`/`handleDeleteOne` to await and then increment `refreshKey` to trigger reload.

---

#### **UPDATE FILE:** [src/pages/OrgCaching.tsx](src/pages/OrgCaching.tsx)

**Changes:**
- `getAllOrgUsers()` becomes async
- Add `useState` for `orgUsers`, `useEffect` to load

**Find (line 26):**

```typescript
const orgUsers = getAllOrgUsers();
```

**Replace with:**

```typescript
const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
useEffect(() => {
  getAllOrgUsers().then(setOrgUsers);
}, []);
```

---

### 1.5 Migration Script

#### **NEW FILE:** `src/lib/storage/migrate.ts`

```typescript
import { localDB } from './db';

export async function migrateToIndexedDB(): Promise<void> {
  const migrated = localStorage.getItem('indexeddb_migration_complete');
  if (migrated === 'true') return;

  await localDB.migrateFromLocalStorage();
  localStorage.setItem('indexeddb_migration_complete', 'true');
}
```

Add migration trigger in [src/App.tsx](src/App.tsx):

```typescript
import { useEffect } from "react";
import { migrateToIndexedDB } from "./lib/storage/migrate";

const App = () => {
  useEffect(() => {
    migrateToIndexedDB().catch(console.error);
  }, []);

  return (
    // ... existing JSX
  );
};
```

---

### 1.6 Testing Checklist

#### Manual Tests

- [ ] **Test 1: New User Registration** – Register with Employee ID `TEST001`, verify user in IndexedDB (DevTools → Application → IndexedDB)
- [ ] **Test 2: Cache Creation** – Send 5 queries, verify 5 entries in cache table with query, response, compressed, embedding
- [ ] **Test 3: Cache Hit (Semantic)** – Send similar queries; second should show "From Cache" when similarity > 0.85
- [ ] **Test 4: Migration** – With existing localStorage data, reload; verify migration logs and data in IndexedDB
- [ ] **Test 5: CacheDashboard** – Stats and entries load; delete/export work

---

## Phase 2: Real LLM Integration (Week 2)

### 2.1 Install Anthropic SDK

```bash
npm install @anthropic-ai/sdk
```

### 2.2 Environment Setup

#### **NEW FILE:** `.env.local`

```env
VITE_ANTHROPIC_API_KEY=your-api-key-here
```

#### **UPDATE:** [gitignore.txt](gitignore.txt)

Ensure `.env.local` is ignored. Current `*.local` covers it.

---

### 2.3 Create LLM Service

#### **NEW FILE:** `src/api/llmAPI.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const client = API_KEY
  ? new Anthropic({ apiKey: API_KEY, dangerouslyAllowBrowser: true })
  : null;

export async function callLLM(query: string): Promise<string> {
  if (!client) {
    const { simulateLLMResponse } = await import('../lib/mockLLM');
    return simulateLLMResponse(query);
  }

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: query }],
  });

  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
}
```

---

### 2.4 Update Chat to Use Real LLM

#### **UPDATE FILE:** [src/pages/Chat.tsx](src/pages/Chat.tsx)

**Find:**
```typescript
import { simulateLLMResponse } from "@/lib/mockLLM";
```

**Replace with:**
```typescript
import { callLLM } from "@/api/llmAPI";
```

**Find:**
```typescript
const response = await simulateLLMResponse(query);
```

**Replace with:**
```typescript
const response = await callLLM(query);
```

---

## Phase 3: Real Embeddings (Week 2-3)

### 3.1 Install TensorFlow.js

```bash
npm install @tensorflow/tfjs @tensorflow-models/universal-sentence-encoder
```

### 3.2 Create Embeddings Service

#### **NEW FILE:** `src/lib/embeddings/encoder.ts`

```typescript
import * as use from '@tensorflow-models/universal-sentence-encoder';

let model: use.UniversalSentenceEncoder | null = null;

export async function initEmbeddings(): Promise<void> {
  if (model) return;
  model = await use.load();
}

export async function getEmbedding(text: string): Promise<number[]> {
  if (!model) await initEmbeddings();
  const embeddings = await model!.embed([text]);
  const arr = await embeddings.array();
  return Array.from(arr[0]);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}
```

---

### 3.3 Update Cache with Semantic Search

#### **UPDATE FILE:** [src/lib/cache.ts](src/lib/cache.ts)

Add:

```typescript
import { getEmbedding, cosineSimilarity as embCosine } from './embeddings/encoder';

export async function checkSemanticCache(
  employeeId: string,
  query: string,
  threshold = 0.88
): Promise<{ hit: boolean; entry?: CacheEntry; similarity?: number }> {
  const queryEmbedding = await getEmbedding(query);
  const entries = await localDB.getCacheByEmployee(employeeId);

  let best: (typeof entries)[0] | null = null;
  let bestSim = 0;

  for (const entry of entries) {
    if (!entry.embedding?.length) continue;
    const sim = embCosine(queryEmbedding, entry.embedding);
    if (sim >= threshold && sim > bestSim) {
      bestSim = sim;
      best = entry;
    }
  }

  if (best) {
    await localDB.updateCacheHit(best.id!);
    return {
      hit: true,
      entry: {
        queryText: best.queryText,
        llmResponse: best.llmResponse,
        compressedResponse: best.compressedResponse,
        hitCount: best.hitCount + 1,
        compressionRatio: best.compressionRatio,
        originalTokens: best.originalTokens,
        compressedTokens: best.compressedTokens,
        vector: best.embedding,
        createdAt: best.createdAt,
        lastAccessed: new Date().toISOString(),
      },
      similarity: bestSim,
    };
  }
  return { hit: false };
}

export async function addToCacheWithEmbedding(
  employeeId: string,
  projectId: string,
  query: string,
  response: string
): Promise<CacheEntry> {
  const embedding = await getEmbedding(query);
  const compressed = compressText(response);
  const originalTokens = estimateTokens(response);
  const compressedTokens = estimateTokens(compressed);
  const compressionRatio = Math.round((1 - compressedTokens / originalTokens) * 100);

  await localDB.addToCache({
    projectId,
    employeeId,
    queryText: query,
    llmResponse: response,
    compressedResponse: compressed,
    embedding,
    compressionRatio,
    originalTokens,
    compressedTokens,
  });

  return {
    queryText: query,
    llmResponse: response,
    compressedResponse: compressed,
    hitCount: 1,
    compressionRatio,
    originalTokens,
    compressedTokens,
    vector: embedding,
    createdAt: new Date().toISOString(),
    lastAccessed: new Date().toISOString(),
  };
}
```

---

### 3.4 Update Chat to Use Semantic Cache

#### **UPDATE FILE:** [src/pages/Chat.tsx](src/pages/Chat.tsx)

**Replace:**
```typescript
const cached = await checkCache(session.employeeId, query);
```

**With:**
```typescript
const cached = await checkSemanticCache(session.employeeId, query, 0.88);
```

**Replace:**
```typescript
const entry = await addToCache(session.employeeId, query, response);
```

**With:**
```typescript
const entry = await addToCacheWithEmbedding(
  session.employeeId,
  session.projectName,
  query,
  response
);
```

---

## Summary of File Changes

### Files to CREATE

| Path | Purpose |
|------|---------|
| `src/lib/storage/db.ts` | IndexedDB wrapper |
| `src/lib/storage/migrate.ts` | Migration script |
| `src/api/llmAPI.ts` | LLM service |
| `src/lib/embeddings/encoder.ts` | Embeddings service |
| `.env.local` | Environment variables |
| `docs/MIGRATION_PLAN.md` | This document |

### Files to UPDATE

| Path | Changes |
|------|---------|
| `src/lib/userStore.ts` | IndexedDB, async, prompts table |
| `src/lib/cache.ts` | IndexedDB, async, Phase 3 semantic |
| `src/pages/Chat.tsx` | Async cache/LLM, semantic in Phase 3 |
| `src/pages/Login.tsx` | Async login/register |
| `src/pages/CacheDashboard.tsx` | Async load, state |
| `src/pages/OrgCaching.tsx` | Async getAllOrgUsers |
| `src/App.tsx` | Migration trigger |
| `package.json` | idb, @anthropic-ai/sdk, tfjs, use |
| `gitignore.txt` | .env.local (if needed) |

### Files to KEEP (no changes)

| Path | Note |
|------|------|
| `src/lib/session.ts` | Session stays in localStorage |
| `src/lib/mockLLM.ts` | Fallback when no API key |
| `src/lib/utils.ts` | No changes |
| `src/components/ui/*` | No changes |

---

## Rollback Plan

### Restore localStorage

```typescript
export async function rollbackToLocalStorage(): Promise<void> {
  const users = await localDB.getAllUsers();
  const cacheEntries = await localDB.getCacheByProject(/* all projects */);

  const byProject: Record<string, unknown[]> = {};
  for (const e of cacheEntries) {
    if (!byProject[e.projectId]) byProject[e.projectId] = [];
    byProject[e.projectId].push({
      queryText: e.queryText,
      llmResponse: e.llmResponse,
      compressedResponse: e.compressedResponse,
      vector: e.embedding,
      compressionRatio: e.compressionRatio,
      originalTokens: e.originalTokens,
      compressedTokens: e.compressedTokens,
      hitCount: e.hitCount,
      createdAt: e.createdAt,
      lastAccessed: e.lastAccessed,
    });
  }

  localStorage.setItem('dell_compact_org_users', JSON.stringify(users));
  localStorage.setItem('dell_compact_cache', JSON.stringify(byProject));
  localStorage.removeItem('indexeddb_migration_complete');
  await localDB.deleteDatabase();
}
```

---

## Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| Phase 1: IndexedDB | 3-4 days | Storage migration |
| Phase 2: Real LLM | 2-3 days | Anthropic integration |
| Phase 3: Embeddings | 2-3 days | Semantic search |
| Testing | 2-3 days | Full QA |
| **Total** | **~2 weeks** | |

---

## Success Metrics

- [ ] No localStorage errors
- [ ] IndexedDB holds all data
- [ ] Cache hit rate > 60% (Phase 3)
- [ ] Real LLM responses
- [ ] Semantic similarity working
- [ ] No performance regressions
