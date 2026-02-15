# RAG Compressor V2 -- Token-Optimized Pipeline

## Overview

The RAG Compressor reduces the number of tokens sent to the LLM while preserving full semantic meaning. It runs a **6-stage pipeline** where each stage targets a different source of token waste. The output is sent directly to the LLM -- no dictionary block, no metadata, just the compressed text with inline annotations.

**Key design principles:**

- Optimize for **token count** (not character count) -- tokens are what LLMs charge for
- **Never replace** an n-gram unless the replacement provably saves tokens (ROI check)
- Preserve semantic meaning -- the LLM must understand the compressed text identically
- Inline annotations keep the first occurrence readable in context

```
Raw Text
  │
  ▼
┌─────────────────────────────────────┐
│ Stage 1: Security & Term Substitution │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Stage 2: Smart Whitespace Encoding    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Stage 3: Token-Aware N-Gram          │
│          Compression (inline annot.) │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Stage 4: Punctuation & Final Cleanup │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Stage 5: Semantic Pruning (optional) │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Stage 6: LLM Summarization (optional)│
└──────────────┬──────────────────────┘
               │
               ▼
         Compressed Output
        (sent directly to LLM)
```

Stages 5 and 6 are gated by `aggressive: true`. When `aggressive: false` (default), only Stages 1-4 run.

---

## Stage 1: Security & Term Substitution

**Purpose:** Redact sensitive data and shorten verbose phrases into compact equivalents.

**How it works:**
1. Load mappings from `public/data/encryption.json`
2. Sort all keys by length descending (longest match first)
3. For each key, case-insensitive regex replace throughout the text

**Three categories of mappings:**

| Category | Example Input | Output |
|----------|--------------|--------|
| Security redaction | `confidential_password` | `[REDACTED_PWD]` |
| Verbose phrase shortening | `due to the fact that` | `because` |
| Product name compression | `PowerStore` | `₪1` |

**Full example:**

```
INPUT:
In order to deploy PowerStore in production, you need ProDeploy services.
Due to the fact that PowerFlex is software-defined, it scales flexibly.
At this point in time, PowerScale supports up to 50 petabytes.
Never expose the secret_api_key in logs.

AFTER STAGE 1:
to deploy ₪1 in production, you need ₪35 services.
because ₪2 is software-defined, it scales flexibly.
now, ₪3 supports up to 50 petabytes.
Never expose the [REDACTED_KEY] in logs.
```

**Source file:** `src/lib/compression/compressor.ts` -- `stage1()`
**Mappings file:** `public/data/encryption.json` (89 entries)

---

## Stage 2: Smart Whitespace & JSON Normalization

**Purpose:** Eliminate wasted tokens from formatting whitespace and noise fields. This is the highest-impact stage for structured content.

**How it works:**

The stage first splits the input into **JSON blocks** and **prose blocks**, then handles each differently:

**For JSON blocks** (valid `{...}` or `[...]`):
1. `JSON.parse()` the block
2. Recursively remove empty/noise values: empty strings, whitespace-only strings, `null`, empty objects `{}`, empty arrays `[]`
3. `JSON.stringify()` without formatting (full minification)

**For prose blocks** (everything else):
1. Normalize tabs to spaces
2. Collapse inline multi-spaces (2+) to single space
3. Collapse 3+ consecutive newlines to double newline

**Full example:**

```
INPUT:
{
    "assets": [
        {
            "id": "node-001",
            "type": "PowerEdge Server",
            "padding": "                                                            ",
            "metadata": "",
            "logs": ["iDRAC-heartbeat-ok"]
        }
    ]
}

First      paragraph.


Second     paragraph.

AFTER STAGE 2:
{"assets":[{"id":"node-001","type":"PowerEdge Server","logs":["iDRAC-heartbeat-ok"]}]}

First paragraph.

Second paragraph.
```

Notice:
- The JSON went from 10 lines to 1 line (full minification)
- `padding` and `metadata` keys were **completely removed** (not just emptied) because their values were empty/whitespace
- Prose spaces were collapsed, newlines normalized

**Why this is better than indent halving:**

| Approach | Savings on 1000-line JSON |
|----------|--------------------------|
| Halve indentation | ~5-10% |
| Full minification | ~20-35% |
| Minify + strip empty keys | ~30-50% |

The structural meaning of JSON is carried by `{}`, `[]`, `:`, `,` -- not by whitespace. Indentation is purely for human readability and wastes tokens.

**Source file:** `src/lib/compression/compressor.ts` -- `stage2()`, `splitJsonAndProse()`, `minifyJson()`, `stripEmptyKeys()`, `normalizeProse()`

---

## Stage 3: Token-Aware N-Gram Compression

**Purpose:** Replace repeated phrases with short `§N` tokens, using inline annotation for the first occurrence.

This is the core compression stage and has three key innovations over V1:

### 3A. Dynamic Minimum Occurrence Thresholds

Short phrases need more repetitions to justify the overhead of a §-token:

| N-gram length | Minimum occurrences |
|--------------|-------------------|
| 2 words | 5 or more |
| 3 words | 4 or more |
| 4-5 words | 3 or more |
| 6+ words | 2 or more |

### 3B. ROI Check (Token Profitability)

Before replacing any n-gram, the compressor calculates actual token savings:

```
Original cost  = occurrences x tokenCount(phrase)
Compressed cost = tokenCount(§N«phrase») + (occurrences - 1) x tokenCount(§N)

Replace ONLY if: Original cost > Compressed cost
```

This prevents the V1 problem where replacing `"is the"` (2 tokens) with `§17` (2-3 tokens) actually INCREASED token count.

### 3C. Inline First-Occurrence Annotation

Instead of a separate dictionary block:

```
OLD (V1 -- dictionary block):
§§§DICTIONARY
§1=machine learning models
§§§END
§1 require data. §1 can be fine-tuned.

NEW (V2 -- inline annotation):
§1«machine learning models» require data. §1 can be fine-tuned.
```

The first occurrence keeps the full phrase in context (wrapped in `§N«...»`), subsequent occurrences use the bare `§N` token. Benefits:
- Eliminates the dictionary block overhead entirely (no `§§§DICTIONARY`/`§§§END`)
- The LLM sees the phrase in its natural context on first use
- Semantically clearer than a lookup table

### How it works:

1. Scan for n-grams from n=10 down to n=2 (longer phrases first)
2. For each n-gram that meets the minimum occurrence threshold:
   a. Run the ROI check -- skip if it would increase token count
   b. Replace the first occurrence with `§N«phrase»`
   c. Replace all subsequent occurrences with `§N`
3. Protect §-tokens from whitespace splitting during processing using null-byte interleaving

**Full example:**

```
INPUT (after Stages 1-2):
retrieval augmented generation pipeline is powerful.
retrieval augmented generation pipeline is scalable.
retrieval augmented generation pipeline is efficient.
retrieval augmented generation pipeline is modern.
The system works well. The system works well.

AFTER STAGE 3:
§1«retrieval augmented generation pipeline» is powerful.
§1 is scalable.
§1 is efficient.
§1 is modern.
The system works well. The system works well.

Dictionary (metadata, not in output): { "§1": "retrieval augmented generation pipeline" }
Skipped by ROI: "the system works well" (2 occurrences, ROI negative)
```

Note: `"the system works well"` appears only twice as a 4-gram (threshold = 3), so it is not even considered. `"is powerful"` etc. appear only once each as 2-grams, so they are also excluded.

**Source file:** `src/lib/compression/compressor.ts` -- `stage3()`, `findNGrams()`, `isReplacementProfitable()`

---

## Stage 4: Punctuation & Final Cleanup

**Purpose:** Remove unnecessary spacing around punctuation marks without destroying meaning.

**Rules applied:**
- Space before punctuation: `" ."` becomes `"."`
- Space around brackets: `"( x )"` becomes `"(x)"`
- Space around quotes: `'" x "'` becomes `'"x"'`
- Final trim

**This stage does NOT collapse multi-spaces** -- Stage 2 already handled that.

**Full example:**

```
INPUT (after Stages 1-3):
The result is §1«retrieval augmented generation pipeline» .
Data is stored in { "database" : "pgvector" } .
Use "vector search" for queries .

AFTER STAGE 4:
The result is §1«retrieval augmented generation pipeline».
Data is stored in {"database":"pgvector"}.
Use"vector search"for queries.
```

**Source file:** `src/lib/compression/compressor.ts` -- `stage4()`

---

## Stage 5: Semantic Pruning (Optional)

**Purpose:** Remove stop words for maximum compression. Only active when `aggressive: true`.

**How it works:**
1. Split text into words
2. Remove common stop words: `the`, `a`, `an`, `is`, `was`, `in`, `on`, `at`, `to`, `for`, `of`, `with`, `by`, `from`, `as`, `are`, `were`, `been`, `be`, `have`, `has`, `had`, `do`, `does`, `did`, `will`, `would`, `should`, `could`, `may`, `might`, `must`, `can`, `this`, `that`, `these`, `those`, `it`, `its`, `also`, `about`
3. Always keep: §-tokens, inline annotations (guillemet content), punctuation, content words

**Full example:**

```
INPUT (after Stages 1-4):
The §1«retrieval augmented generation pipeline» is a powerful system that can process data.

AFTER STAGE 5 (aggressive=true):
§1«retrieval augmented generation pipeline» powerful system process data.

AFTER STAGE 5 (aggressive=false):
The §1«retrieval augmented generation pipeline» is a powerful system that can process data.
(unchanged -- stage skipped)
```

**Source file:** `src/lib/compression/compressor.ts` -- `stage5()`

---

## Stage 6: LLM-based Summarization (Optional)

**Purpose:** Use a language model (currently a deterministic mock) to remove noise content such as decorative markers, section headers, and meta-comments. Only active when `aggressive: true`.

**Architecture:**

Stage 6 uses a `Summarizer` interface, currently implemented by `MockSummarizer`. This allows swapping in a real LLM backend later without changing the compressor.

```typescript
interface Summarizer {
  summarize(text: string): Promise<string>;
}
```

The compressor exposes `setSummarizer(s: Summarizer)` to inject a custom backend.

**MockSummarizer rules (applied in order):**

1. **Remove decorative separator runs** -- runs of 4+ `=`, `-`, `*`, or `#` characters (e.g., `=========================================`)
2. **Remove ALL-CAPS section headers** -- `SECTION N: TITLE TEXT` patterns (e.g., `SECTION 3: LARGE JSON DATASET 1 (ASSET MANAGEMENT)`)
3. **Remove test/internal markers** -- multi-segment ALL-CAPS hyphenated markers (e.g., `DELL-INTERNAL-STRESS-TEST-START`)
4. **Remove meta-comments** -- parenthetical filler like `(Imagine this continues for 500 lines)`, bracket filler like `[REPEATING 50 TIMES...]`, and ellipsis descriptions like `... (Adding 700 lines) ...`
5. **Collapse multi-spaces** -- clean up whitespace left after removals
6. **Final trim**

**Important note:** Stage 6 runs AFTER Stage 5 (semantic pruning). When `aggressive=true`, Stage 5 joins all words with single spaces, removing newlines. Therefore all Stage 6 patterns work on inline text (no line anchors).

**Full example:**

```
INPUT (after Stages 1-5, aggressive=true):
========= SECTION 1: INFRASTRUCTURE ========= Dell optimizes pipeline. DELL-INTERNAL-STRESS-TEST-START data content. (Imagine this continues for 500 lines) [REPEATING 50 TIMES TO SIMULATE REDUNDANCY...] More content.

AFTER STAGE 6:
Dell optimizes pipeline. data content. More content.
```

**Source file:** `src/lib/compression/summarizer.ts` -- `MockSummarizer.summarize()`
**Compressor integration:** `src/lib/compression/compressor.ts` -- `stage6()`

---

## End-to-End Example

**Raw input:**

```
In order to deploy PowerStore in production, we need PowerStore
configuration guides. PowerStore documentation is available online.
Due to the fact that PowerFlex is software-defined, PowerFlex
scales well. PowerFlex supports multiple protocols.
At this point in time we are evaluating    both options .
```

**After Stage 1** (Security & Terms):

```
to deploy ₪1 in production, we need ₪1
configuration guides. ₪1 documentation is available online.
because ₪2 is software-defined, ₪2
scales well. ₪2 supports multiple protocols.
now we are evaluating    both options .
```

**After Stage 2** (Whitespace & JSON Normalization):

```
to deploy ₪1 in production, we need ₪1 configuration guides. ₪1 documentation is available online. because ₪2 is software-defined, ₪2 scales well. ₪2 supports multiple protocols. now we are evaluating both options .
```

(This is pure prose, so multi-spaces are collapsed. If there were JSON blocks, they would be fully minified with empty keys removed.)

**After Stage 3** (N-Gram Compression):
(No n-grams pass ROI in this short example -- phrases don't repeat enough)

```
to deploy ₪1 in production, we need ₪1 configuration guides. ₪1 documentation is available online. because ₪2 is software-defined, ₪2 scales well. ₪2 supports multiple protocols. now we are evaluating both options .
```

**After Stage 4** (Cleanup):

```
to deploy ₪1 in production, we need ₪1 configuration guides. ₪1 documentation is available online. because ₪2 is software-defined, ₪2 scales well. ₪2 supports multiple protocols. now we are evaluating both options.
```

**After Stage 5** (Pruning, aggressive=true):

```
deploy ₪1 production, need ₪1 configuration guides. ₪1 documentation available online. because ₪2 software-defined, ₪2 scales well. ₪2 supports multiple protocols. now evaluating options.
```

**After Stage 6** (Summarization, aggressive=true):
(No decorative markers or meta-comments in this example -- text passes through unchanged)

```
deploy ₪1 production, need ₪1 configuration guides. ₪1 documentation available online. because ₪2 software-defined, ₪2 scales well. ₪2 supports multiple protocols. now evaluating options.
```

---

## Async Pipeline

Starting with V2.1, `compress()` is an **async** method returning `Promise<CompressionResult>`. This is because Stage 6 calls the summarizer backend, which may involve an async LLM API call. All callers must `await` the result:

```typescript
const result = await compressor.compress(text, { aggressive: true });
```

`compressBatch()` runs all texts in parallel via `Promise.all()`.

---

## Token Counting

All token counts use **js-tiktoken** with `cl100k_base` encoding (compatible with GPT-4 / Claude). Fallback: `Math.ceil(text.length / 4)`.

The final metric `compressedTokens` is counted on the **full output** -- since V2 has no dictionary block, this equals `tokenCount(compressedText)`.

---

## Output Format

The compressor returns a `CompressionResult` with:

| Field | Description |
|-------|-------------|
| `compressedText` | The final compressed text |
| `compressedWithDictionary` | Same as `compressedText` (V2 has no separate dictionary) |
| `dictionary` | Metadata: `{ "§1": "phrase", ... }` for UI display |
| `originalTokens` | Token count of input |
| `compressedTokens` | Token count of output |
| `compressionRatio` | `compressedTokens / originalTokens` (0.0--1.0) |
| `compressionPercentage` | Percent reduced (0--100) |
| `savedTokens` | `originalTokens - compressedTokens` |
| `stages` | Per-stage token savings breakdown (6 stages) |
| `stageTexts` | Intermediate text after each stage (for UI visualization) |
| `metadata` | Debug info: n-grams found, replaced, skipped by ROI |

---

## File Structure

```
src/lib/compression/
├── compressor.ts       # RAGCompressor class (6-stage async pipeline)
├── summarizer.ts       # Summarizer interface + MockSummarizer
├── tokenCounter.ts     # js-tiktoken wrapper (cl100k_base)
├── securityLoader.ts   # Loads encryption.json mappings
├── types.ts            # CompressionResult, CompressionOptions, SecurityMappings
├── goldenExample.ts    # Test input (Dell + Tech)
├── index.ts            # Barrel exports
└── __tests__/
    └── compressor.test.ts  # 56 tests covering all 6 stages
```

---

## Test Coverage (56 tests)

| Suite | Tests | What it covers |
|-------|-------|----------------|
| Stage 1 -- Security & Terms | 4 | Redaction, phrase substitution, case-insensitivity, savings metric |
| Stage 2 -- JSON & Whitespace | 11 | JSON minification, empty key stripping, null removal, empty object/array removal, nested cleanup, inline space collapse, newline collapse, tabs, mixed JSON+prose, savings metric |
| Stage 3 -- N-Gram (inline) | 7 | Inline annotation format, no dictionary block, compressedWithDictionary=compressedText |
| Stage 3 -- ROI Check | 3 | Skip unprofitable, track skipped count, replace profitable |
| Stage 3 -- Thresholds | 2 | 2-gram needs >=5, 6+ gram needs >=2 |
| Stage 4 -- Cleanup | 3 | Punctuation, brackets, savings metric |
| Stage 5 -- Pruning | 4 | Off by default, prunes stop words, keeps content words, keeps §-tokens |
| Stage 6 -- Summarization | 9 | Skip when non-aggressive, decorative line removal, section header removal, test marker removal, meta-comment removal (paren + bracket), blank line collapse, savings metric, stageTexts exposure |
| Metrics | 6 | Token counts, savedTokens, 6 stageTexts, ratio, dictionary fields, 6 stages |
| Edge Cases | 3 | Empty string, single word, special characters |
| 10 Large Texts | 1 | Batch compression with detailed logging |
| Golden Example | 1 | Dell + Tech integration test |
| Stress Test | 2 | Whitespace-heavy JSON, mixed prose+JSON |
