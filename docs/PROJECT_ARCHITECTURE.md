# Dell Compact — Project Architecture

> **RAG Gateway** with semantic caching, prompt compression, and IndexedDB storage.
>
> Stack: React 18 + TypeScript + Vite + shadcn/ui + IndexedDB (`idb`) + js-tiktoken

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [End-to-End Query Flow](#end-to-end-query-flow)
3. [Project Structure](#project-structure)
4. [Pages & Routes](#pages--routes)
5. [Compression Pipeline](#compression-pipeline)
6. [Semantic Cache](#semantic-cache)
7. [IndexedDB Storage](#indexeddb-storage)
8. [Session & User Management](#session--user-management)
9. [Mock LLM](#mock-llm)
10. [Testing](#testing)
11. [Configuration & Data Files](#configuration--data-files)
12. [Scripts](#scripts)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (Client)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌───────────┐   ┌──────────────┐   ┌───────────┐   ┌──────────┐ │
│   │  Login /   │   │    Chat      │   │   Cache   │   │Compress  │ │
│   │  Session   │──▶│    Page      │   │ Dashboard │   │  View    │ │
│   └───────────┘   └──────┬───────┘   └───────────┘   └──────────┘ │
│                          │                                          │
│                   ┌──────▼───────┐                                  │
│                   │  cache.ts    │◀── Semantic similarity check     │
│                   │  (checkCache │    (cosine > 0.85)               │
│                   │   addToCache)│                                  │
│                   └──────┬───────┘                                  │
│                          │                                          │
│              ┌───────────┴───────────┐                              │
│              │                       │                              │
│        Cache HIT              Cache MISS                            │
│         │                        │                                  │
│         │                 ┌──────▼───────┐                          │
│         │                 │  RAG         │ 4-stage pipeline          │
│         │                 │  Compressor  │ §-token dictionary        │
│         │                 └──────┬───────┘                          │
│         │                        │                                  │
│         │                 ┌──────▼───────┐                          │
│         │                 │  LLM         │ (currently mock)          │
│         │                 │  (mockLLM)   │                          │
│         │                 └──────┬───────┘                          │
│         │                        │                                  │
│         │                 Store in cache                             │
│         │                        │                                  │
│         └────────┬───────────────┘                                  │
│                  │                                                   │
│           ┌──────▼───────┐                                          │
│           │  Show LLM    │  (always uncompressed)                   │
│           │  Response    │                                          │
│           └──────────────┘                                          │
│                                                                     │
│           ┌──────────────────────────────────────┐                  │
│           │         IndexedDB                    │                  │
│           │  ┌────────┐ ┌────────┐ ┌──────────┐ │                  │
│           │  │ users  │ │ cache  │ │ prompts  │ │                  │
│           │  └────────┘ └────────┘ └──────────┘ │                  │
│           └──────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## End-to-End Query Flow

The complete lifecycle of a user query, from keystroke to displayed response:

```
┌──────────────────────────────────────────────────────────────────┐
│                      USER TYPES A QUERY                          │
│                     "What is RAG?"                                │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Chat.tsx        │
              │  handleSend()    │
              └────────┬────────┘
                       │
                       ▼
         ┌──────────────────────────┐
         │  1. checkCache()         │
         │     projectId + query    │
         │                          │
         │  textToVector(query)     │──▶ 8-dim embedding
         │  for each cached entry:  │
         │    cosineSimilarity()    │
         │    threshold > 0.85      │
         └────────┬─────────────────┘
                  │
          ┌───────┴────────┐
          │                │
     Cache HIT        Cache MISS
          │                │
          ▼                ▼
   ┌─────────────┐  ┌──────────────────────────────────────┐
   │ Return       │  │ 2. compressor.compress(query)        │
   │ cached       │  │                                      │
   │ llmResponse  │  │    Stage 1: Security substitution    │
   │ as-is        │  │    Stage 2: N-gram → §-tokens        │
   │              │  │    Stage 3: Whitespace cleanup        │
   │ updateHit()  │  │    Stage 4: Semantic pruning (opt.)  │
   └──────┬──────┘  │                                      │
          │         │    Returns:                           │
          │         │    - compressedWithDictionary          │
          │         │    - dictionary { §1: "phrase" }       │
          │         │    - token metrics                     │
          │         └──────────────┬───────────────────────┘
          │                        │
          │                        ▼
          │         ┌──────────────────────────────────────┐
          │         │ 3. simulateLLMResponse(               │
          │         │      compressedWithDictionary)         │
          │         │                                      │
          │         │    Sends COMPRESSED prompt to LLM     │
          │         │    Receives UNCOMPRESSED response      │
          │         └──────────────┬───────────────────────┘
          │                        │
          │                        ▼
          │         ┌──────────────────────────────────────┐
          │         │ 4. addToCache(                        │
          │         │      projectId,                       │
          │         │      query,            ◀─ original    │
          │         │      compressedPrompt, ◀─ what LLM    │
          │         │      llmResponse,         saw          │
          │         │      metrics)          ◀─ tokens      │
          │         │                                      │
          │         │    Stores embedding of original query  │
          │         └──────────────┬───────────────────────┘
          │                        │
          │         ┌──────────────┘
          ▼         ▼
   ┌─────────────────────────┐
   │ 5. addUserPrompt()       │
   │    Logs query to prompts │
   │    table in IndexedDB    │
   └──────────┬──────────────┘
              │
              ▼
   ┌─────────────────────────────────────────────┐
   │ 6. Display response to user                  │
   │                                              │
   │    content = llmResponse (ALWAYS original)    │
   │    metadata = compression stats + cache info  │
   │                                              │
   │    User can expand "View Compressed Prompt"   │
   │    to see what was actually sent to the LLM   │
   └──────────────────────────────────────────────┘
```

### Key Principle

> **The user always sees the real, uncompressed LLM response.**
> The compressor only reduces the input tokens sent to the LLM.
> The compressed prompt (with §-dictionary) is stored for transparency/debugging.

---

## Project Structure

```
compact/
├── docs/                          # Documentation
│   ├── PROJECT_ARCHITECTURE.md    # ← This file
│   ├── compressor_plan.md         # Original compressor specification
│   ├── COMPRESSOR_IMPLEMENTATION_PLAN.md
│   ├── MIGRATION_PLAN.md          # localStorage → IndexedDB plan
│   └── tests.md                   # Test plan specification
│
├── public/
│   └── data/
│       └── encryption.json        # Security mappings for Stage 1
│
├── src/
│   ├── main.tsx                   # React entry point
│   ├── App.tsx                    # Routes, providers, init
│   ├── index.css                  # Tailwind + global styles
│   │
│   ├── pages/
│   │   ├── Login.tsx              # Employee login form
│   │   ├── Chat.tsx               # Main chat interface
│   │   ├── CacheDashboard.tsx     # Cache analytics + management
│   │   ├── CompressionView.tsx    # Interactive compression demo
│   │   ├── OrgCaching.tsx         # Organization-wide cache view
│   │   ├── TestingDashboard.tsx   # UI test runner for IndexedDB
│   │   ├── Index.tsx              # Landing redirect
│   │   └── NotFound.tsx           # 404 page
│   │
│   ├── components/
│   │   ├── ChatMessage.tsx        # Chat bubble with compression metadata
│   │   ├── ChatSidebar.tsx        # Cache stats sidebar
│   │   ├── NavLink.tsx            # Navigation helper
│   │   └── ui/                    # 40+ shadcn/ui components
│   │
│   ├── lib/
│   │   ├── cache.ts               # Semantic cache operations
│   │   ├── mockLLM.ts             # Simulated LLM responses
│   │   ├── session.ts             # Session management (localStorage)
│   │   ├── userStore.ts           # User CRUD + vector utils
│   │   ├── utils.ts               # Tailwind cn() helper
│   │   │
│   │   ├── compression/
│   │   │   ├── index.ts           # Barrel exports
│   │   │   ├── compressor.ts      # RAGCompressor (4-stage pipeline)
│   │   │   ├── types.ts           # CompressionResult, CompressionOptions
│   │   │   ├── tokenCounter.ts    # js-tiktoken cl100k_base wrapper
│   │   │   ├── securityLoader.ts  # Loads encryption.json mappings
│   │   │   └── __tests__/
│   │   │       └── compressor.test.ts  # 28 unit tests
│   │   │
│   │   └── storage/
│   │       ├── db.ts              # IndexedDB wrapper (idb)
│   │       ├── migrate.ts         # localStorage → IndexedDB migration
│   │       └── tests.ts           # Console-callable IndexedDB tests
│   │
│   ├── hooks/
│   │   ├── use-toast.ts
│   │   └── use-mobile.tsx
│   │
│   └── test/
│       ├── setup.ts
│       └── example.test.ts
│
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
├── tailwind.config.ts
└── index.html
```

---

## Pages & Routes

| Route | Page Component | Description |
|-------|---------------|-------------|
| `/` | `Login` | Employee ID + name + project login form |
| `/chat` | `Chat` | Main chat interface with cache-aware messaging |
| `/cache` | `CacheDashboard` | Cache analytics: stats, charts, entry management |
| `/compression` | `CompressionView` | Interactive compression pipeline demo |
| `/org-cache` | `OrgCaching` | Organization-wide cache overview |
| `/testing` | `TestingDashboard` | UI-based IndexedDB test runner |
| `*` | `NotFound` | 404 fallback |

### App Initialization (`App.tsx`)

On mount, the app runs two async operations:

1. **`migrateToIndexedDB()`** — migrates any legacy localStorage data to IndexedDB
2. **`compressor.init()`** — initializes the token counter (cl100k_base) and loads security mappings

---

## Compression Pipeline

### Overview

The `RAGCompressor` class implements a 4-stage text compression pipeline designed to reduce the token count of prompts sent to LLMs.

**File:** `src/lib/compression/compressor.ts`

### Stage 1 — Security & Term Substitution

- Loads mappings from `public/data/encryption.json`
- Replaces sensitive terms: `confidential_password` → `[REDACTED_PWD]`
- Replaces verbose phrases: `in order to` → `to`, `due to the fact that` → `because`
- Case-insensitive matching, longest-match-first

### Stage 2 — N-Gram Mining (10 → 2) with §-Token Dictionary

Iteratively scans the text for repeated phrases:

1. Starts with 10-word phrases, works down to 2-word phrases
2. Any phrase appearing **2+ times** is replaced with a compact `§n` token
3. Builds a dictionary: `{ "§1": "machine learning models", "§2": "deep learning" }`
4. Uses `\x00` internally to protect already-replaced tokens from being broken apart

**Dictionary format** prepended to the compressed output:

```
§§§DICTIONARY
§1=machine learning models
§2=deep neural networks
§§§END
The §1 require large amounts of data. §2 are powerful. §1 can be fine-tuned.
```

The `§` character (U+00A7) was chosen because:
- Extremely rare in natural text
- Encodes as a single token in cl100k_base (GPT-4/Claude tokenizer)
- Combined with a number (`§1`) = only 2 tokens total

### Stage 3 — Whitespace & Punctuation Cleanup

- Collapses multiple spaces to single space
- Removes spaces before punctuation: `Hello .` → `Hello.`
- Cleans bracket spacing: `( text )` → `(text)`
- Cleans quote spacing

### Stage 4 — Semantic Pruning (Optional)

- Only runs when `aggressive: true` is passed
- Removes stop words (`the`, `a`, `an`, `is`, `was`, `in`, `on`, etc.)
- Preserves all §-tokens and content words

### Compression Result

```typescript
interface CompressionResult {
  compressedText: string;              // text after all stages
  compressedWithDictionary: string;    // §-dictionary header + compressed text (sent to LLM)
  dictionary: Record<string, string>;  // { "§1": "phrase", "§2": "phrase" }

  originalTokens: number;
  compressedTokens: number;            // counted on compressedWithDictionary
  compressionRatio: number;            // 0.0–1.0
  compressionPercentage: number;       // 0–100 (% reduced)
  savedTokens: number;

  stages: {                            // per-stage token savings
    stage1_security: number;
    stage2_ngrams: number;
    stage3_whitespace: number;
    stage4_pruning: number;
  };

  stageTexts: {                        // intermediate texts for visualization
    afterStage1: string;
    afterStage2: string;
    afterStage3: string;
    afterStage4: string;
  };

  metadata: {
    originalLength: number;
    compressedLength: number;
    ngramsFound: number;
    ngramsReplaced: number;
  };
}
```

### Token Counting

- **Library:** `js-tiktoken` with `cl100k_base` encoding (GPT-4 / Claude compatible)
- **Fallback:** `Math.ceil(text.length / 4)` if tokenizer fails to initialize
- **File:** `src/lib/compression/tokenCounter.ts`

---

## Semantic Cache

### How It Works

**File:** `src/lib/cache.ts`

The cache uses **semantic similarity** to match queries, not exact string matching:

1. Each query is converted to an 8-dimensional embedding vector (`textToVector()`)
2. When a new query arrives, its vector is compared against all cached query vectors
3. If **cosine similarity > 0.85**, it's a cache hit — the stored LLM response is returned instantly
4. On cache miss, the response from the LLM is stored with the query's embedding for future matches

### Cache Entry Structure

```typescript
interface CacheEntry {
  queryText: string;         // original user query
  llmResponse: string;       // real LLM response (uncompressed)
  compressedPrompt: string;  // what was actually sent to LLM (with §-dictionary)
  hitCount: number;          // how many times this entry was matched
  compressionRatio: number;  // % token reduction achieved
  originalTokens: number;    // tokens in original prompt
  compressedTokens: number;  // tokens in compressed prompt
  vector: number[];          // 8-dim embedding of queryText
  createdAt: string;         // ISO timestamp
  lastAccessed: string;      // ISO timestamp
}
```

### Cache API

| Function | Signature | Description |
|----------|-----------|-------------|
| `checkCache` | `(projectId, query) → { hit, entry?, similarity? }` | Semantic lookup |
| `addToCache` | `(projectId, query, compressedPrompt, llmResponse, metrics) → CacheEntry` | Store new entry |
| `getCacheStats` | `(projectId) → { totalQueries, totalHits, hitRate, avgCompression }` | Aggregate stats |
| `getCacheEntries` | `(projectId) → CacheEntry[]` | List all entries |
| `deleteCacheEntries` | `(projectId, indices) → void` | Bulk delete |
| `clearProjectCache` | `(projectId) → void` | Clear all for project |
| `exportCacheAsJSON` | `(projectId) → string` | JSON export |

### Vector Similarity

**File:** `src/lib/userStore.ts`

- `textToVector(text)` — creates an 8-dimensional unit vector from word character codes
- `cosineSimilarity(a, b)` — standard cosine similarity: `dot(a,b) / (||a|| * ||b||)`

> **Note:** This is a simplified embedding for demo purposes. In production, this would be replaced with a real embedding model (e.g., `text-embedding-ada-002`).

---

## IndexedDB Storage

### Database

- **Name:** `dell-compact-db`
- **Version:** 2
- **Library:** `idb` (lightweight IndexedDB wrapper with Promises)
- **File:** `src/lib/storage/db.ts`

### Schema

#### `users` store

| Field | Type | Description |
|-------|------|-------------|
| `employeeId` | `string` (key) | Unique employee identifier |
| `fullName` | `string` | Display name |
| `projectName` | `string` | Associated project |
| `registeredAt` | `string` | ISO timestamp |
| `lastLogin` | `string?` | Last login timestamp |

**Indexes:** `by-name` (fullName), `by-project` (projectName)

#### `cache` store

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` (auto) | Primary key |
| `projectId` | `string` | Project scope |
| `employeeId` | `string` | Who created it |
| `queryText` | `string` | Original user query |
| `llmResponse` | `string` | Real LLM response (uncompressed) |
| `compressedPrompt` | `string` | Compressed prompt sent to LLM (with §-dictionary) |
| `embedding` | `number[]` | 8-dim query vector |
| `hitCount` | `number` | Times matched |
| `compressionRatio` | `number` | % reduction |
| `originalTokens` | `number` | Pre-compression token count |
| `compressedTokens` | `number` | Post-compression token count |
| `createdAt` | `string` | ISO timestamp |
| `lastAccessed` | `string` | ISO timestamp |

**Indexes:** `by-project`, `by-employee`, `by-query`, `by-date`

#### `prompts` store

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` (auto) | Primary key |
| `employeeId` | `string` | Who asked |
| `projectId` | `string` | Project scope |
| `queryText` | `string` | The query |
| `timestamp` | `string` | ISO timestamp |
| `cached` | `boolean` | Was it a cache hit? |
| `responseTime` | `number?` | Response latency (ms) |

**Indexes:** `by-employee`, `by-project`, `by-date`

### Version History

| Version | Changes |
|---------|---------|
| 1 | Initial schema: users, cache, prompts stores |
| 2 | Renamed `compressedResponse` → `compressedPrompt` in cache store (migration handler renames field in existing records) |

### Migration from localStorage

On first load, `migrateToIndexedDB()` (file: `src/lib/storage/migrate.ts`) checks for legacy localStorage keys (`dell_compact_org_users`, `dell_compact_cache`) and migrates data into IndexedDB.

---

## Session & User Management

### Session (`src/lib/session.ts`)

```typescript
interface UserSession {
  name: string;
  employeeId: string;
  projectName: string;
  loginTimestamp: string;
}
```

- Stored in `localStorage` under key `dell_compact_session`
- Functions: `saveSession()`, `getSession()`, `clearSession()`
- Login page creates the session; all other pages check for it

### User Store (`src/lib/userStore.ts`)

- `registerUser(employeeId, fullName, projectName)` — adds to IndexedDB
- `findUserByEmployeeId(id)` — lookup
- `addUserPrompt(employeeId, project, query, cached)` — logs every query
- `getAllOrgUsers()` — list all registered employees
- `textToVector(text)` — 8-dim embedding
- `cosineSimilarity(a, b)` — vector comparison

---

## Mock LLM

**File:** `src/lib/mockLLM.ts`

Currently the project uses a **mock LLM** that returns keyword-matched responses:

| Keywords in query | Response topic |
|------------------|----------------|
| `rag`, `retrieval` | RAG architecture explanation |
| `compress` | Text compression techniques |
| `cache`, `caching` | Semantic caching explanation |
| `llm`, `language model`, `gpt` | LLM overview |
| *(default)* | Generic RAG response |

- Simulated latency: 800–2000ms random delay
- The mock receives the **compressed prompt** (with §-dictionary), matching real production behavior

> **Future:** Replace `simulateLLMResponse()` with a real API call (OpenAI, Anthropic, etc.). The compression saves tokens on the input, reducing API costs.

---

## Testing

### Unit Tests (Vitest)

**File:** `src/lib/compression/__tests__/compressor.test.ts`

28 tests across 7 test suites:

| Suite | Tests | Coverage |
|-------|-------|----------|
| Stage 1 – Security | 4 | Term replacement, case-insensitive, verbose phrases |
| Stage 2 – N-Gram §-tokens | 7 | Detection, §-format, dictionary, longer-first, dictionary header |
| Stage 3 – Whitespace | 3 | Space collapse, punctuation, brackets |
| Stage 4 – Pruning | 4 | Default off, aggressive on, content preservation, §-token survival |
| Metrics | 5 | Token counts, savedTokens, stage texts, ratio, dictionary fields |
| Edge Cases | 3 | Empty string, single word, special characters |
| 10 Large Texts | 1 | Visual regression: 10 diverse texts with before/after + dictionary |

**Run:** `npm test` or `npm run test:watch`

### IndexedDB Tests (Browser Console)

**File:** `src/lib/storage/tests.ts`

15 interactive tests accessible via `window.dbTests.*`:

```javascript
dbTests.addUser()           // Test user CRUD
dbTests.addCache()          // Test cache operations
dbTests.addPrompt()         // Test prompt logging
dbTests.testMigration()     // Test localStorage migration
dbTests.exportData()        // Test export/import
dbTests.runAll()            // Run all 15 tests
```

### UI Test Dashboard

**Route:** `/testing`

A visual dashboard (`TestingDashboard.tsx`) that runs all IndexedDB tests with green/red status indicators.

---

## Configuration & Data Files

### `public/data/encryption.json`

Security mappings loaded by `securityLoader.ts` at runtime:

```json
{
  "mappings": {
    "confidential_password": "[REDACTED_PWD]",
    "secret_api_key": "[REDACTED_KEY]",
    "internal_server_name": "[INTERNAL_HOST]",
    "private_access_token": "[REDACTED_TOKEN]",
    "in order to": "to",
    "due to the fact that": "because",
    "at this point in time": "now",
    "for the purpose of": "for",
    "in the event that": "if",
    "with regard to": "regarding",
    "it is important to note that": "note:",
    "as previously mentioned": "previously,"
  }
}
```

### `vite.config.ts`

- Dev server, path aliases (`@/ → src/`)

### `vitest.config.ts`

- Environment: `jsdom`
- Globals enabled for test utilities

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run build:dev` | Development build |
| `npm run preview` | Preview production build |
| `npm test` | Run Vitest (all tests) |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run lint` | ESLint check |

---

## Dependencies

### Runtime

| Package | Purpose |
|---------|---------|
| `react` + `react-dom` | UI framework |
| `react-router-dom` | Client-side routing |
| `@tanstack/react-query` | Async state management |
| `idb` | IndexedDB wrapper with Promise API |
| `js-tiktoken` | Token counting (cl100k_base encoding) |
| `recharts` | Charts in CacheDashboard |
| `date-fns` | Date formatting |
| `lucide-react` | Icon library |
| `sonner` | Toast notifications |
| Radix UI | Accessible UI primitives (shadcn/ui) |
| `tailwind-merge` + `clsx` | Conditional CSS classes |

### Dev

| Package | Purpose |
|---------|---------|
| `vite` | Build tool + dev server |
| `vitest` | Unit test framework |
| `typescript` | Type checking |
| `tailwindcss` | Utility-first CSS |
| `eslint` | Linting |
| `playwright` | Browser automation (for UI tests) |

---

*Last updated: February 14, 2026*
