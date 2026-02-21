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
 * Mock summarizer that uses deterministic regex rules.
 * Use as fallback or when API is unreachable.
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

// ============================================
// API IMPLEMENTATION (Real LLM)
// ============================================

import { queryLLM } from '../llmClient';

export class ApiSummarizer implements Summarizer {
  private fallback = new MockSummarizer();

  async summarize(text: string): Promise<string> {
    const systemPrompt = `
You are a text summarizer/compressor.
Your goal is to reduce the following text to its core meaning, maintaining key information but removing fluff.
If the text is already short, return it as is.
Target length: ~40-60% of original.

Output strictly the summarized text. Do not add "Here is the summary" or markers.
`;

    try {
      // If text is extremely short, skip LLM to save latency
      if (text.length < 100) return text;

      const response = await queryLLM(text, systemPrompt);
      return response.trim();
    } catch (err) {
      console.warn("ApiSummarizer failed, falling back to mock:", err);
      return this.fallback.summarize(text);
    }
  }
}
