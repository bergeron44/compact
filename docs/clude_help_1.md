# MISSION: Create Migration Plan Document

You need to create a comprehensive Markdown document that details the EXACT migration plan from the current localStorage-based architecture to an enhanced IndexedDB + Real LLM architecture.

## Document to Create:

**File:** `docs/MIGRATION_PLAN.md`

---

## Document Structure & Content:

Create a detailed document with the following sections:

---

# Migration Plan: localStorage → IndexedDB + Real LLM Integration

## Executive Summary

### Current State
- **Storage:** localStorage (5-10MB limit)
- **LLM:** Mock responses (keyword matching)
- **Embeddings:** Simple hash-based vectors
- **Compression:** Client-side extractive (first 50% of sentences)
- **Cache:** String-based exact matching

### Target State
- **Storage:** IndexedDB (50MB-unlimited)
- **LLM:** Anthropic Claude Sonnet 4 (real API)
- **Embeddings:** TensorFlow.js Universal Sentence Encoder
- **Compression:** Enhanced multi-stage pipeline
- **Cache:** Semantic similarity (cosine > 0.88)

### Benefits of Migration
| Feature | Before | After | Improvement |
|---------|--------|-------|-------------|
| Storage Capacity | 5-10MB | 50MB-Unlimited | 10-100x |
| Query Speed | O(n) linear scan | O(log n) indexed | 100-1000x |
| LLM Quality | Keyword match | Real Claude | ∞ |
| Cache Hit Rate | ~20% (exact match) | ~60% (semantic) | 3x |
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

Update `package.json`:
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
  // Users table
  users: {
    key: string; // employeeId (primary key)
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

  // Cache table (semantic cache with embeddings)
  cache: {
    key: number; // auto-increment ID
    value: {
      id?: number;
      projectId: string;
      employeeId: string;
      queryText: string;
      llmResponse: string;
      compressedResponse: string;
      embedding: number[]; // 512-dim vector
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

  // Prompts history
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

class LocalDatabase {
  private db: IDBPDatabase | null = null;
  private readonly DB_NAME = 'dell-compact-db';
  private readonly DB_VERSION = 1;

  // Initialize database
  async init(): Promise {
    if (this.db) return; // Already initialized

    this.db = await openDB(this.DB_NAME, this.DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        console.log(`Upgrading DB from v${oldVersion} to v${newVersion}`);

        // Create Users store
        if (!db.objectStoreNames.contains('users')) {
          const usersStore = db.createObjectStore('users', {
            keyPath: 'employeeId',
          });
          usersStore.createIndex('by-name', 'fullName');
          usersStore.createIndex('by-project', 'projectName');
        }

        // Create Cache store
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

        // Create Prompts store
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

    console.log('✅ Database initialized');
  }

  // ============================================
  // USERS OPERATIONS
  // ============================================

  async addUser(user: Omit): Promise {
    await this.ensureInit();
    const userWithTimestamp = {
      ...user,
      registeredAt: new Date().toISOString(),
    };
    return await this.db!.add('users', userWithTimestamp);
  }

  async getUser(employeeId: string): Promise {
    await this.ensureInit();
    return await this.db!.get('users', employeeId);
  }

  async updateUserLogin(employeeId: string): Promise {
    await this.ensureInit();
    const user = await this.getUser(employeeId);
    if (user) {
      user.lastLogin = new Date().toISOString();
      await this.db!.put('users', user);
    }
  }

  async getAllUsers(): Promise {
    await this.ensureInit();
    return await this.db!.getAll('users');
  }

  async getUsersByProject(projectName: string): Promise {
    await this.ensureInit();
    return await this.db!.getAllFromIndex('users', 'by-project', projectName);
  }

  // ============================================
  // CACHE OPERATIONS
  // ============================================

  async addToCache(
    entry: Omit
  ): Promise {
    await this.ensureInit();
    const cacheEntry = {
      ...entry,
      hitCount: 1,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
    };
    return await this.db!.add('cache', cacheEntry);
  }

  async getCacheEntry(id: number): Promise {
    await this.ensureInit();
    return await this.db!.get('cache', id);
  }

  async getCacheByProject(projectId: string): Promise {
    await this.ensureInit();
    return await this.db!.getAllFromIndex('cache', 'by-project', projectId);
  }

  async getCacheByEmployee(employeeId: string): Promise {
    await this.ensureInit();
    return await this.db!.getAllFromIndex('cache', 'by-employee', employeeId);
  }

  async updateCacheHit(id: number): Promise {
    await this.ensureInit();
    const entry = await this.getCacheEntry(id);
    if (entry) {
      entry.hitCount++;
      entry.lastAccessed = new Date().toISOString();
      await this.db!.put('cache', entry);
    }
  }

  async deleteCache(id: number): Promise {
    await this.ensureInit();
    await this.db!.delete('cache', id);
  }

  async clearCacheForProject(projectId: string): Promise {
    await this.ensureInit();
    const entries = await this.getCacheByProject(projectId);
    const tx = this.db!.transaction('cache', 'readwrite');
    await Promise.all([
      ...entries.map(entry => tx.store.delete(entry.id!)),
      tx.done,
    ]);
  }

  // ============================================
  // PROMPTS OPERATIONS
  // ============================================

  async addPrompt(
    prompt: Omit
  ): Promise {
    await this.ensureInit();
    const promptWithTimestamp = {
      ...prompt,
      timestamp: new Date().toISOString(),
    };
    return await this.db!.add('prompts', promptWithTimestamp);
  }

  async getPromptsByEmployee(employeeId: string): Promise {
    await this.ensureInit();
    return await this.db!.getAllFromIndex('prompts', 'by-employee', employeeId);
  }

  async getPromptsByProject(projectId: string): Promise {
    await this.ensureInit();
    return await this.db!.getAllFromIndex('prompts', 'by-project', projectId);
  }

  // ============================================
  // STATISTICS
  // ============================================

  async getCacheStats(projectId: string) {
    await this.ensureInit();
    const cacheEntries = await this.getCacheByProject(projectId);
    const prompts = await this.getPromptsByProject(projectId);

    const totalQueries = cacheEntries.length;
    const totalHits = cacheEntries.reduce((sum, e) => sum + e.hitCount, 0);
    const totalPrompts = prompts.length;
    const cacheHits = prompts.filter(p => p.cached).length;

    const hitRate = totalPrompts > 0 ? (cacheHits / totalPrompts) * 100 : 0;
    const avgCompression = totalQueries > 0
      ? cacheEntries.reduce((sum, e) => sum + e.compressionRatio, 0) / totalQueries
      : 0;

    return {
      totalQueries,
      totalHits,
      totalPrompts,
      cacheHits,
      hitRate: Math.round(hitRate),
      avgCompression: Math.round(avgCompression * 100),
    };
  }

  // ============================================
  // EXPORT / IMPORT
  // ============================================

  async exportData(): Promise {
    await this.ensureInit();
    const [users, cache, prompts] = await Promise.all([
      this.getAllUsers(),
      this.db!.getAll('cache'),
      this.db!.getAll('prompts'),
    ]);

    const exportData = {
      version: this.DB_VERSION,
      exportedAt: new Date().toISOString(),
      users,
      cache,
      prompts,
    };

    return JSON.stringify(exportData, null, 2);
  }

  async importData(jsonData: string): Promise {
    await this.ensureInit();
    const data = JSON.parse(jsonData);

    // Clear existing data
    const tx = this.db!.transaction(['users', 'cache', 'prompts'], 'readwrite');
    await Promise.all([
      tx.objectStore('users').clear(),
      tx.objectStore('cache').clear(),
      tx.objectStore('prompts').clear(),
      tx.done,
    ]);

    // Import new data
    for (const user of data.users || []) {
      await this.db!.add('users', user);
    }
    for (const entry of data.cache || []) {
      await this.db!.add('cache', entry);
    }
    for (const prompt of data.prompts || []) {
      await this.db!.add('prompts', prompt);
    }

    console.log('✅ Data imported successfully');
  }

  // ============================================
  // MIGRATION FROM LOCALSTORAGE
  // ============================================

  async migrateFromLocalStorage(): Promise {
    await this.ensureInit();
    console.log('🔄 Starting migration from localStorage...');

    try {
      // Migrate users
      const orgUsersData = localStorage.getItem('dell_compact_org_users');
      if (orgUsersData) {
        const orgUsers = JSON.parse(orgUsersData);
        for (const user of orgUsers) {
          await this.addUser({
            employeeId: user.employeeId,
            fullName: user.fullName,
            projectName: user.projectName,
          });
        }
        console.log(`✅ Migrated ${orgUsers.length} users`);
      }

      // Migrate cache
      const cacheData = localStorage.getItem('dell_compact_cache');
      if (cacheData) {
        const cache = JSON.parse(cacheData);
        let count = 0;
        for (const projectId in cache) {
          for (const entry of cache[projectId]) {
            await this.addToCache({
              projectId,
              employeeId: entry.employeeId || 'unknown',
              queryText: entry.queryText,
              llmResponse: entry.llmResponse,
              compressedResponse: entry.compressedResponse,
              embedding: entry.vector || [],
              compressionRatio: entry.compressionRatio,
              originalTokens: entry.originalTokens,
              compressedTokens: entry.compressedTokens,
            });
            count++;
          }
        }
        console.log(`✅ Migrated ${count} cache entries`);
      }

      console.log('✅ Migration completed!');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  private async ensureInit(): Promise {
    if (!this.db) {
      await this.init();
    }
  }

  async close(): Promise {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async deleteDatabase(): Promise {
    await this.close();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    console.log('🗑️ Database deleted');
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

export const localDB = new LocalDatabase();

// Auto-initialize on import
localDB.init().catch(console.error);
```

---

### 1.3 Update Existing Files

#### **UPDATE FILE:** `src/lib/userStore.ts`

**Changes:**
- Replace localStorage calls with IndexedDB
- Keep the same function signatures
- Add migration trigger

**Before:**
```typescript
// OLD CODE (lines to FIND)
const STORAGE_KEY = "dell_compact_org_users";

export function getAllOrgUsers(): OrgUser[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

function saveOrgUsers(users: OrgUser[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}
```

**After:**
```typescript
// NEW CODE (REPLACE with)
import { localDB } from './storage/db';

export async function getAllOrgUsers(): Promise {
  const users = await localDB.getAllUsers();
  return users.map(u => ({
    employeeId: u.employeeId,
    fullName: u.fullName,
    projectName: u.projectName,
    prompts: [], // Will be populated from prompts table
    registeredAt: u.registeredAt,
  }));
}

export async function findUserByEmployeeId(employeeId: string) {
  return await localDB.getUser(employeeId);
}

export async function registerUser(
  employeeId: string,
  fullName: string,
  projectName: string
) {
  await localDB.addUser({
    employeeId,
    fullName,
    projectName,
  });
}

export async function addUserPrompt(
  employeeId: string,
  projectId: string,
  queryText: string,
  cached: boolean
) {
  await localDB.addPrompt({
    employeeId,
    projectId,
    queryText,
    cached,
  });
}
```

**Full file location:** `src/lib/userStore.ts`  
**Action:** REPLACE the storage functions, KEEP vector functions (for now)

---

#### **UPDATE FILE:** `src/lib/cache.ts`

**Changes:**
- Replace localStorage cache with IndexedDB
- Keep compression logic (will enhance later)

**Before:**
```typescript
// OLD CODE
const CACHE_KEY = "dell_compact_cache";

export function loadCache(): Record {
  const stored = localStorage.getItem(CACHE_KEY);
  return stored ? JSON.parse(stored) : {};
}

export function saveCache(cache: Record) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}
```

**After:**
```typescript
// NEW CODE
import { localDB } from './storage/db';

export async function checkCache(
  employeeId: string,
  query: string
): Promise {
  // Get all cache entries for this employee
  const cacheEntries = await localDB.getCacheByEmployee(employeeId);

  // Simple text match for now (will add semantic later)
  const match = cacheEntries.find(
    e => e.queryText.toLowerCase() === query.toLowerCase()
  );

  if (match) {
    // Update hit count
    await localDB.updateCacheHit(match.id!);

    return {
      hit: true,
      entry: {
        queryText: match.queryText,
        llmResponse: match.llmResponse,
        compressedResponse: match.compressedResponse,
        hitCount: match.hitCount + 1,
        compressionRatio: match.compressionRatio,
      },
    };
  }

  return { hit: false };
}

export async function addToCache(
  employeeId: string,
  projectId: string,
  query: string,
  response: string
) {
  const compressed = compressText(response);
  const originalTokens = estimateTokens(response);
  const compressedTokens = estimateTokens(compressed);
  const compressionRatio = 1 - compressedTokens / originalTokens;

  await localDB.addToCache({
    projectId,
    employeeId,
    queryText: query,
    llmResponse: response,
    compressedResponse: compressed,
    embedding: [], // Will add real embeddings in Phase 2
    compressionRatio,
    originalTokens,
    compressedTokens,
  });

  return {
    queryText: query,
    llmResponse: response,
    compressedResponse: compressed,
    compressionRatio,
    originalTokens,
    compressedTokens,
  };
}

export async function getCacheStats(projectId: string) {
  return await localDB.getCacheStats(projectId);
}
```

**Full file location:** `src/lib/cache.ts`  
**Action:** REPLACE storage functions, KEEP `compressText()` and `estimateTokens()`

---

#### **UPDATE FILE:** `src/lib/session.ts`

**Note:** Session can STAY in localStorage (it's small and temporary)

**No changes needed** - keep using localStorage for session

---

### 1.4 Update React Components

#### **UPDATE FILE:** `src/pages/Chat.tsx`

**Changes:**
- Change all cache/user functions to async/await
- Add loading states

**Find this code (around line 80):**
```typescript
const handleSend = () => {
  // ...
  const cached = checkCache(session.employeeId, query);
  if (cached.hit && cached.entry) {
    // ...
  }
}
```

**Replace with:**
```typescript
const handleSend = async () => {
  if (!inputValue.trim() || isLoading) return;

  const query = inputValue.trim();
  setInputValue("");
  setIsLoading(true);

  try {
    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: query,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Check cache (NOW ASYNC!)
    const cached = await checkCache(session.employeeId, query);

    let response: string;
    let cacheHit = false;

    if (cached.hit && cached.entry) {
      // Cache hit
      response = cached.entry.llmResponse;
      cacheHit = true;
    } else {
      // Cache miss - call LLM
      response = await simulateLLMResponse(query);

      // Add to cache (NOW ASYNC!)
      await addToCache(session.employeeId, session.projectName, query, response);
    }

    // Add prompt to history (NOW ASYNC!)
    await addUserPrompt(session.employeeId, session.projectName, query, cacheHit);

    // Add assistant message
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: response,
      timestamp: new Date(),
      cached: cacheHit,
    };
    setMessages((prev) => [...prev, assistantMessage]);

  } catch (error) {
    console.error("Error in handleSend:", error);
    toast({
      title: "Error",
      description: "Failed to process your message. Please try again.",
      variant: "destructive",
    });
  } finally {
    setIsLoading(false);
  }
};
```

**Location:** `src/pages/Chat.tsx`  
**Action:** UPDATE the `handleSend` function

---

#### **UPDATE FILE:** `src/pages/Login.tsx`

**Find:**
```typescript
const handleRegister = () => {
  registerUser(employeeId, name, selectedProject.id);
  // ...
}
```

**Replace with:**
```typescript
const handleRegister = async () => {
  setIsLoading(true);
  try {
    await registerUser(employeeId, name, selectedProject.id);
    
    // Save session
    saveSession({
      name,
      employeeId,
      projectName: selectedProject.name,
      loginTimestamp: new Date().toISOString(),
    });

    navigate("/chat");
  } catch (error) {
    console.error("Registration failed:", error);
    toast({
      title: "Error",
      description: "Registration failed. Please try again.",
      variant: "destructive",
    });
  } finally {
    setIsLoading(false);
  }
};
```

---

#### **UPDATE FILE:** `src/pages/CacheDashboard.tsx`

**Find:**
```typescript
const loadCacheData = () => {
  const cache = loadCache();
  // ...
}
```

**Replace with:**
```typescript
const loadCacheData = async () => {
  setIsLoading(true);
  try {
    const cacheEntries = await localDB.getCacheByProject(session.projectName);
    setCache(cacheEntries);

    const stats = await localDB.getCacheStats(session.projectName);
    setStats(stats);
  } catch (error) {
    console.error("Failed to load cache:", error);
  } finally {
    setIsLoading(false);
  }
};

useEffect(() => {
  loadCacheData();
}, [session.projectName]);
```

---

### 1.5 Migration Script

#### **NEW FILE:** `src/lib/storage/migrate.ts`
```typescript
import { localDB } from './db';

export async function migrateToIndexedDB(): Promise {
  console.log('🔄 Starting migration...');

  try {
    // Check if already migrated
    const migrated = localStorage.getItem('indexeddb_migration_complete');
    if (migrated === 'true') {
      console.log('✅ Already migrated');
      return;
    }

    // Run migration
    await localDB.migrateFromLocalStorage();

    // Mark as complete
    localStorage.setItem('indexeddb_migration_complete', 'true');

    // Optional: Clear old data
    const clearOld = confirm(
      'Migration complete! Do you want to clear old localStorage data?'
    );
    if (clearOld) {
      localStorage.removeItem('dell_compact_cache');
      localStorage.removeItem('dell_compact_org_users');
      console.log('🗑️ Old data cleared');
    }

    console.log('✅ Migration successful!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}
```

**Add migration trigger in:** `src/App.tsx`
```typescript
import { migrateToIndexedDB } from './lib/storage/migrate';

function App() {
  useEffect(() => {
    // Run migration on app load
    migrateToIndexedDB().catch(console.error);
  }, []);

  return (
    // ... existing code
  );
}
```

---

### 1.6 Testing Checklist

Create this section in the document:

## Testing Phase 1

### Manual Tests

- [ ] **Test 1: New User Registration**
  - Open app in incognito
  - Register with Employee ID: `TEST001`
  - Verify user appears in IndexedDB (DevTools → Application → IndexedDB)

- [ ] **Test 2: Cache Creation**
  - Send 5 different queries
  - Check IndexedDB cache table has 5 entries
  - Verify each has: query, response, compressed, embedding

- [ ] **Test 3: Cache Hit**
  - Send exact same query twice
  - Second time should show "From Cache"
  - Check hitCount incremented in IndexedDB

- [ ] **Test 4: Migration**
  - In existing app with localStorage data
  - Reload page
  - Check migration console logs
  - Verify data copied to IndexedDB

- [ ] **Test 5: Export/Import**
  - Export data from IndexedDB
  - Clear database
  - Import data back
  - Verify all data restored

### DevTools Inspection
```javascript
// Open browser console and run:

// View all users
const db = await window.indexedDB.databases();
console.log('Databases:', db);

// Or use idb library
import { localDB } from './lib/storage/db';
const users = await localDB.getAllUsers();
console.log('Users:', users);
```

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

#### **UPDATE FILE:** `.gitignore`

Add:
```
.env.local
```

---

### 2.3 Create LLM Service

#### **NEW FILE:** `src/api/llmAPI.ts`
```typescript
import Anthropic from '@anthropic-ai/sdk';

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.warn('⚠️ ANTHROPIC_API_KEY not found - using mock LLM');
}

const client = API_KEY
  ? new Anthropic({
      apiKey: API_KEY,
      dangerouslyAllowBrowser: true, // For client-side POC
    })
  : null;

export async function callLLM(query: string): Promise {
  if (!client) {
    // Fallback to mock
    return await import('../lib/mockLLM').then(m => m.simulateLLMResponse(query));
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: query,
        },
      ],
    });

    return message.content[0].type === 'text' ? message.content[0].text : '';
  } catch (error) {
    console.error('LLM API Error:', error);
    throw error;
  }
}

export async function callLLMStream(
  query: string,
  onChunk: (text: string) => void,
  onComplete: (fullText: string) => void
): Promise {
  if (!client) {
    const response = await import('../lib/mockLLM').then(m =>
      m.simulateLLMResponse(query)
    );
    onComplete(response);
    return;
  }

  try {
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: query }],
    });

    let fullText = '';

    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        const text = chunk.delta.text;
        fullText += text;
        onChunk(text);
      }
    }

    onComplete(fullText);
  } catch (error) {
    console.error('LLM Stream Error:', error);
    throw error;
  }
}
```

---

### 2.4 Update Chat to Use Real LLM

#### **UPDATE FILE:** `src/pages/Chat.tsx`

**Find:**
```typescript
import { simulateLLMResponse } from "@/lib/mockLLM";
```

**Replace with:**
```typescript
import { callLLM, callLLMStream } from "@/api/llmAPI";
```

**Find:**
```typescript
response = await simulateLLMResponse(query);
```

**Replace with:**
```typescript
// Option A: Simple (no streaming)
response = await callLLM(query);

// Option B: With streaming
let response = '';
await callLLMStream(
  query,
  (chunk) => {
    // Update UI with each chunk
    response += chunk;
    setStreamingResponse(response);
  },
  (fullText) => {
    response = fullText;
  }
);
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

export async function initEmbeddings(): Promise {
  if (model) return;

  console.log('🔄 Loading embedding model...');
  model = await use.load();
  console.log('✅ Embedding model loaded');
}

export async function getEmbedding(text: string): Promise {
  if (!model) {
    await initEmbeddings();
  }

  const embeddings = await model!.embed([text]);
  const embedding = await embeddings.array();
  return Array.from(embedding[0]);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same dimension');
  }

  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

  return dotProduct / (magnitudeA * magnitudeB);
}
```

---

### 3.3 Update Cache with Semantic Search

#### **UPDATE FILE:** `src/lib/cache.ts`

**Add:**
```typescript
import { getEmbedding, cosineSimilarity } from './embeddings/encoder';

export async function checkSemanticCache(
  employeeId: string,
  query: string,
  threshold: number = 0.88
): Promise {
  // Get query embedding
  const queryEmbedding = await getEmbedding(query);

  // Get all cache for this employee
  const cacheEntries = await localDB.getCacheByEmployee(employeeId);

  // Find best match
  let bestMatch: any = null;
  let bestSimilarity = 0;

  for (const entry of cacheEntries) {
    if (entry.embedding.length === 0) continue; // Skip entries without embeddings

    const similarity = cosineSimilarity(queryEmbedding, entry.embedding);

    if (similarity > bestSimilarity && similarity >= threshold) {
      bestSimilarity = similarity;
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    // Update hit count
    await localDB.updateCacheHit(bestMatch.id!);

    return {
      hit: true,
      entry: {
        queryText: bestMatch.queryText,
        llmResponse: bestMatch.llmResponse,
        compressedResponse: bestMatch.compressedResponse,
        hitCount: bestMatch.hitCount + 1,
        compressionRatio: bestMatch.compressionRatio,
      },
      similarity: bestSimilarity,
    };
  }

  return { hit: false };
}

export async function addToCacheWithEmbedding(
  employeeId: string,
  projectId: string,
  query: string,
  response: string
) {
  // Generate embedding
  const embedding = await getEmbedding(query);

  // Compress
  const compressed = compressText(response);
  const originalTokens = estimateTokens(response);
  const compressedTokens = estimateTokens(compressed);
  const compressionRatio = 1 - compressedTokens / originalTokens;

  // Save
  await localDB.addToCache({
    projectId,
    employeeId,
    queryText: query,
    llmResponse: response,
    compressedResponse: compressed,
    embedding, // Real embedding!
    compressionRatio,
    originalTokens,
    compressedTokens,
  });

  return {
    queryText: query,
    llmResponse: response,
    compressedResponse: compressed,
    compressionRatio,
  };
}
```

---

### 3.4 Update Chat to Use Semantic Cache

#### **UPDATE FILE:** `src/pages/Chat.tsx`

**Replace:**
```typescript
const cached = await checkCache(session.employeeId, query);
```

**With:**
```typescript
const cached = await checkSemanticCache(session.employeeId, query, 0.88);

if (cached.hit) {
  console.log(`✅ Cache hit! Similarity: ${cached.similarity?.toFixed(2)}`);
}
```

**Replace:**
```typescript
await addToCache(session.employeeId, session.projectName, query, response);
```

**With:**
```typescript
await addToCacheWithEmbedding(
  session.employeeId,
  session.projectName,
  query,
  response
);
```

---

## Summary of File Changes

### Files to CREATE:
1. ✅ `src/lib/storage/db.ts` - IndexedDB wrapper
2. ✅ `src/lib/storage/migrate.ts` - Migration script
3. ✅ `src/api/llmAPI.ts` - LLM service
4. ✅ `src/lib/embeddings/encoder.ts` - Embeddings service
5. ✅ `.env.local` - Environment variables
6. ✅ `docs/MIGRATION_PLAN.md` - This document

### Files to UPDATE:
1. ✅ `src/lib/userStore.ts` - Replace localStorage with IndexedDB
2. ✅ `src/lib/cache.ts` - Replace localStorage with IndexedDB + add semantic search
3. ✅ `src/pages/Chat.tsx` - Add async/await, use real LLM
4. ✅ `src/pages/Login.tsx` - Add async/await
5. ✅ `src/pages/CacheDashboard.tsx` - Add async/await
6. ✅ `src/App.tsx` - Add migration trigger
7. ✅ `package.json` - Add new dependencies
8. ✅ `.gitignore` - Add .env.local

### Files to KEEP (no changes):
1. ✅ `src/lib/session.ts` - Session stays in localStorage
2. ✅ `src/lib/mockLLM.ts` - Keep as fallback
3. ✅ `src/lib/utils.ts` - No changes needed
4. ✅ All `src/components/ui/*` - No changes needed
5. ✅ All config files (vite, tailwind, etc.) - No changes needed

### Files to DELETE (optional cleanup):
1. ❌ `src/data/projects.json` - Unused, can delete
2. ❌ (None others - keep everything else)

---

## Rollback Plan

If migration fails:

### Option A: Restore localStorage
```typescript
// In src/lib/storage/migrate.ts
export async function rollbackToLocalStorage(): Promise {
  const exportData = await localDB.exportData();
  
  // Parse and restore to old format
  const data = JSON.parse(exportData);
  
  localStorage.setItem('dell_compact_org_users', JSON.stringify(data.users));
  localStorage.setItem('dell_compact_cache', JSON.stringify(
    data.cache.reduce((acc, entry) => {
      if (!acc[entry.projectId]) acc[entry.projectId] = [];
      acc[entry.projectId].push(entry);
      return acc;
    }, {})
  ));
  
  // Clear migration flag
  localStorage.removeItem('indexeddb_migration_complete');
  
  console.log('✅ Rolled back to localStorage');
}
```

### Option B: Delete IndexedDB
```typescript
await localDB.deleteDatabase();
```

---

## Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| Phase 1: IndexedDB | 3-4 days | Migrate storage layer |
| Phase 2: Real LLM | 2-3 days | Integrate Anthropic |
| Phase 3: Embeddings | 2-3 days | Add semantic search |
| Testing | 2-3 days | Full QA |
| **Total** | **~2 weeks** | |

---

## Success Metrics

After migration, verify:

- [ ] No localStorage errors
- [ ] IndexedDB has all data
- [ ] Cache hit rate >60%
- [ ] LLM responses are real
- [ ] Semantic similarity working
- [ ] Export/import works
- [ ] No performance degradation

---

END OF DOCUMENT