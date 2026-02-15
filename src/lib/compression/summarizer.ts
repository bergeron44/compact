// ============================================
// SUMMARIZER  –  Stage 6 LLM-based summarization
// ============================================
//
// Provides an abstraction over an LLM summarizer.
// Currently ships with a deterministic MockSummarizer;
// swap in a real LLM backend later by implementing the
// Summarizer interface.
//
// IMPORTANT: Stage 6 runs AFTER Stage 5 (semantic pruning).
// When aggressive=true, Stage 5 joins all words with single spaces,
// removing newlines. Therefore all patterns here must work on
// single-line text (no line anchors).

/**
 * Interface for a text summarizer backend.
 * Implementations may call a local LLM, a remote API, or use
 * deterministic rules (mock).
 */
export interface Summarizer {
  summarize(text: string): Promise<string>;
}

// ── Regex patterns used by the mock ──────────────────────────────────

/** Runs of 4+ decorative characters (=, -, *, #) – inline safe */
const RE_DECORATIVE_RUN = /[=\-*#]{4,}/g;

/**
 * ALL-CAPS "section header" sequences:
 *   SECTION N: SOME TITLE (OPTIONAL PARENS)
 * Requires each "word" to be 2+ uppercase chars (or a standalone number)
 * so it stops before mixed-case words like "Actual".
 */
const RE_SECTION_HEADER = /SECTION\s+\d+\s*:\s*(?:(?:[A-Z0-9_\-()]{2,}|\d+)\s*)*/g;

/** Test / internal markers like DELL-INTERNAL-STRESS-TEST-START */
const RE_TEST_MARKER = /[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){2,}/g;

/** Parenthetical meta-comments: (Imagine this continues...), (Adding 700 lines...) */
const RE_META_PAREN = /\((?:Imagine|Adding|Assuming|Suppose|Note:)[^)]{4,}\)/gi;

/** Square-bracket meta-comments: [REPEATING 50 TIMES...] */
const RE_META_BRACKET = /\[(?:REPEATING|SIMULATING|CONTINUED|NOTE)[^\]]{4,}\]/gi;

/** Ellipsis continuation with description: ... (some text) ... */
const RE_ELLIPSIS_META = /\.{3}\s*\([^)]*\)\s*\.{0,3}/g;

// ─────────────────────────────────────────────────────────────────────

/**
 * Mock summarizer that uses deterministic regex rules to simulate
 * what an LLM summarizer would produce.
 *
 * Rules (applied in order):
 *  1. Remove decorative separator runs (====, ----, etc.)
 *  2. Remove SECTION N: TITLE headers
 *  3. Remove internal / test markers (e.g. DELL-INTERNAL-STRESS-TEST-START)
 *  4. Remove meta-comments (parenthetical & bracket filler)
 *  5. Collapse resulting multi-spaces → single space
 *  6. Final trim
 */
export class MockSummarizer implements Summarizer {
  async summarize(text: string): Promise<string> {
    let result = text;

    // 1. Remove decorative separator runs
    result = result.replace(RE_DECORATIVE_RUN, '');

    // 2. Remove SECTION N: TITLE headers
    result = result.replace(RE_SECTION_HEADER, '');

    // 3. Remove test / internal markers
    result = result.replace(RE_TEST_MARKER, (match) => {
      // Only remove if it's a multi-segment ALL-CAPS marker (3+ dashes)
      // and at least 15 chars, to avoid removing short hyphenated words
      if (match.length >= 15) return '';
      return match;
    });

    // 4. Remove meta-comments
    result = result.replace(RE_META_PAREN, '');
    result = result.replace(RE_META_BRACKET, '');
    result = result.replace(RE_ELLIPSIS_META, '');

    // 5. Collapse multi-spaces → single space
    result = result.replace(/ {2,}/g, ' ');

    // 6. Collapse 3+ newlines → double newline (for non-pruned paths)
    result = result.replace(/(\n[ \t]*){3,}/g, '\n\n');

    // Final trim
    result = result.trim();

    return result;
  }
}
