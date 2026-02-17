// ============================================
// RAG COMPRESSOR V2 – 6-stage token-optimized pipeline
// ============================================

import type { CompressionOptions, CompressionResult } from './types';
import { tokenCounter } from './tokenCounter';
import { securityLoader } from './securityLoader';
import { ApiSummarizer, MockSummarizer, type Summarizer } from './summarizer';

// ── Constants ────────────────────────────────────────────────────────

/** Token prefix for n-gram references (extremely rare in natural text) */
const TOKEN_PREFIX = '§';

/** Guillemet delimiters for inline first-occurrence annotation */
const ANNO_OPEN = '«';
const ANNO_CLOSE = '»';

// ── Stop words for Stage 5 ──────────────────────────────────────────
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
  'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was',
  'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'should', 'could', 'may',
  'might', 'must', 'can', 'this', 'that', 'these', 'those',
  'it', 'its', 'also', 'about',
]);

/**
 * Dynamic minimum-occurrence thresholds per n-gram length.
 * Shorter phrases need more repetitions to justify the §-token overhead.
 */
const MIN_OCCURRENCES: Record<number, number> = {
  2: 5,
  3: 4,
  4: 3,
  5: 3,
};
const MIN_OCCURRENCES_DEFAULT = 2; // 6+ word n-grams

// =====================================================================

export class RAGCompressor {
  private initialized = false;

  // ──────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ──────────────────────────────────────────────────────────────────

  /** Must be called once before compress() */
  async init(): Promise<void> {
    if (this.initialized) return;

    console.log('[RAGCompressor] Initializing (V2)...');
    await Promise.all([tokenCounter.init(), securityLoader.load()]);
    this.initialized = true;
    console.log('[RAGCompressor] Ready');
  }

  isReady(): boolean {
    return this.initialized;
  }

  // ──────────────────────────────────────────────────────────────────
  // STAGE 1 – Security & Term Substitution
  // ──────────────────────────────────────────────────────────────────

  private stage1(text: string): string {
    const mappings = securityLoader.getMappings();
    const keys = Object.keys(mappings);
    if (keys.length === 0) return text;

    let result = text;

    // Sort by length DESC so longer phrases match first
    const sorted = keys.sort((a, b) => b.length - a.length);

    for (const key of sorted) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      result = result.replace(regex, mappings[key]);
    }

    return result;
  }

  // ──────────────────────────────────────────────────────────────────
  // STAGE 2 – Smart Whitespace & JSON Normalization
  // ──────────────────────────────────────────────────────────────────

  /**
   * Recursively strip empty / noise values from a parsed JSON value.
   * Removes keys whose values are: empty string, whitespace-only string,
   * null, undefined, or empty arrays / objects.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static stripEmptyKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => RAGCompressor.stripEmptyKeys(item)).filter((v) => v !== undefined);
    }
    if (obj !== null && typeof obj === 'object') {
      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        const stripped = RAGCompressor.stripEmptyKeys(value);
        if (stripped === undefined) continue;                 // drop
        if (stripped === null) continue;                      // drop nulls
        if (typeof stripped === 'string' && stripped.trim() === '') continue; // drop empty / whitespace
        if (Array.isArray(stripped) && stripped.length === 0) continue;       // drop empty arrays
        if (typeof stripped === 'object' && !Array.isArray(stripped) && Object.keys(stripped).length === 0) continue; // drop empty objects
        cleaned[key] = stripped;
      }
      return cleaned;
    }
    return obj;
  }

  /**
   * Try to parse `candidate` as JSON. Returns the minified string on success,
   * or null if it is not valid JSON.
   */
  private minifyJson(candidate: string): string | null {
    try {
      const parsed = JSON.parse(candidate);
      const cleaned = RAGCompressor.stripEmptyKeys(parsed);
      return JSON.stringify(cleaned);
    } catch {
      return null;
    }
  }

  /**
   * Detect top-level JSON blocks in `text` (delimited by matching `{…}` or `[…]`
   * at the outermost level). Returns an array of segments, each flagged as JSON or prose.
   */
  private splitJsonAndProse(text: string): Array<{ type: 'json' | 'prose'; content: string }> {
    const segments: Array<{ type: 'json' | 'prose'; content: string }> = [];
    let i = 0;

    while (i < text.length) {
      // Look for the next potential JSON start
      const openChar = text[i];
      if (openChar === '{' || openChar === '[') {
        const closeChar = openChar === '{' ? '}' : ']';
        let depth = 1;
        let j = i + 1;
        let inString = false;
        let escape = false;

        // Walk forward, tracking brace/bracket depth and string literals
        while (j < text.length && depth > 0) {
          const ch = text[j];
          if (escape) {
            escape = false;
          } else if (ch === '\\' && inString) {
            escape = true;
          } else if (ch === '"') {
            inString = !inString;
          } else if (!inString) {
            if (ch === openChar) depth++;
            else if (ch === closeChar) depth--;
          }
          j++;
        }

        if (depth === 0) {
          const candidate = text.slice(i, j);
          const minified = this.minifyJson(candidate);
          if (minified !== null) {
            segments.push({ type: 'json', content: minified });
            i = j;
            continue;
          }
        }
        // Not valid JSON — fall through, treat this character as prose
      }

      // Accumulate prose until the next potential JSON opener
      const nextOpen = text.slice(i + 1).search(/[{[]/);
      const end = nextOpen === -1 ? text.length : i + 1 + nextOpen;
      const prose = text.slice(i, end);
      // Merge with previous prose segment if possible
      if (segments.length > 0 && segments[segments.length - 1].type === 'prose') {
        segments[segments.length - 1].content += prose;
      } else {
        segments.push({ type: 'prose', content: prose });
      }
      i = end;
    }

    return segments;
  }

  /**
   * Normalize a prose (non-JSON) block:
   * - Tabs → 2 spaces
   * - Collapse inline multi-spaces → single space
   * - Collapse 3+ newlines → double newline
   */
  private normalizeProse(text: string): string {
    let result = text;

    // Tabs → spaces
    result = result.replace(/\t/g, ' ');

    // Line-by-line: collapse inline multi-spaces
    result = result
      .split('\n')
      .map((line) => line.replace(/ {2,}/g, ' '))
      .join('\n');

    // Collapse excessive newlines
    result = result.replace(/\n{3,}/g, '\n\n');

    return result;
  }

  private stage2(text: string): string {
    // Split into JSON blocks and prose blocks
    const segments = this.splitJsonAndProse(text);

    // Process each segment according to its type
    const processed = segments.map((seg) => {
      if (seg.type === 'json') {
        // Already minified + empty keys stripped by splitJsonAndProse
        return seg.content;
      }
      return this.normalizeProse(seg.content);
    });

    return processed.join('');
  }

  // ──────────────────────────────────────────────────────────────────
  // STAGE 3 – Token-Aware N-Gram Compression (inline annotation)
  // ──────────────────────────────────────────────────────────────────

  /**
   * Find all n-grams of size `n` that appear >= minCount times.
   */
  private findNGrams(text: string, n: number, minCount: number): Map<string, number> {
    const words = text.split(/\s+/).filter(Boolean);
    const counts = new Map<string, number>();

    for (let i = 0; i <= words.length - n; i++) {
      const ngram = words.slice(i, i + n).join(' ').toLowerCase();
      counts.set(ngram, (counts.get(ngram) || 0) + 1);
    }

    const filtered = new Map<string, number>();
    for (const [ngram, count] of counts) {
      if (count >= minCount) {
        filtered.set(ngram, count);
      }
    }
    return filtered;
  }

  /**
   * Check whether replacing an n-gram is worth it in terms of actual token savings.
   *
   * Cost model (inline annotation – no dictionary block):
   *   Original cost  = occurrences × tokenCount(phrase)
   *   Compressed cost = tokenCount(§N«phrase») + (occurrences − 1) × tokenCount(§N)
   */
  private isReplacementProfitable(
    phrase: string,
    occurrences: number,
    tokenId: number,
  ): boolean {
    const phraseTokens = tokenCounter.count(phrase);
    const ref = `${TOKEN_PREFIX}${tokenId}`;
    const refTokens = tokenCounter.count(ref);
    const annotationTokens = tokenCounter.count(
      `${ref}${ANNO_OPEN}${phrase}${ANNO_CLOSE}`,
    );

    const originalCost = occurrences * phraseTokens;
    const compressedCost = annotationTokens + (occurrences - 1) * refTokens;

    return originalCost > compressedCost;
  }

  /**
   * Iterative n-gram mining from n=10 down to n=2.
   *
   * V2 changes vs V1:
   *  - Dynamic minimum-occurrence thresholds per n-gram length
   *  - ROI check: skip replacements that don't save tokens
   *  - Inline annotation: first occurrence → §N«phrase», rest → §N
   */
  private stage3(text: string): {
    result: string;
    dictionary: Record<string, string>;
    ngramsFound: number;
    ngramsReplaced: number;
    ngramsSkippedROI: number;
  } {
    let current = text;
    let ngramsFound = 0;
    let ngramsReplaced = 0;
    let ngramsSkippedROI = 0;
    let tokenId = 1;
    const dictionary: Record<string, string> = {};

    for (let n = 10; n >= 2; n--) {
      const minOccurrences = MIN_OCCURRENCES[n] ?? MIN_OCCURRENCES_DEFAULT;
      const candidates = this.findNGrams(current, n, minOccurrences);
      if (candidates.size === 0) continue;

      ngramsFound += candidates.size;

      // Sort by (count DESC, length DESC) – most impactful first
      const sorted = [...candidates.entries()].sort(
        (a, b) => b[1] - a[1] || b[0].length - a[0].length,
      );

      for (const [ngram, count] of sorted) {
        // ── ROI check ──
        if (!this.isReplacementProfitable(ngram, count, tokenId)) {
          ngramsSkippedROI++;
          continue;
        }

        const token = `${TOKEN_PREFIX}${tokenId}`;

        // Use \x00 inside the token to protect it from future whitespace splits
        const protectedToken = token
          .replace(/./g, (ch) => ch + '\x00')
          .slice(0, -1);

        // Build the inline annotation for the FIRST occurrence: §N«phrase»
        const annotationRaw = `${token}${ANNO_OPEN}${ngram}${ANNO_CLOSE}`;
        const protectedAnnotation = annotationRaw
          .replace(/./g, (ch) => ch + '\x00')
          .slice(0, -1);

        // Escape the n-gram for regex
        const escaped = ngram.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');

        // Replace: first match → annotation, rest → token
        let isFirst = true;
        const before = current;
        current = current.replace(regex, () => {
          if (isFirst) {
            isFirst = false;
            return protectedAnnotation;
          }
          return protectedToken;
        });

        if (current !== before) {
          dictionary[token] = ngram;
          ngramsReplaced++;
          tokenId++;
        }
      }
    }

    // Remove null-byte protection characters
    current = current.replace(/\x00/g, '');

    return { result: current, dictionary, ngramsFound, ngramsReplaced, ngramsSkippedROI };
  }

  // ──────────────────────────────────────────────────────────────────
  // STAGE 4 – Punctuation & Final Cleanup
  // ──────────────────────────────────────────────────────────────────

  private stage4(text: string): string {
    return (
      text
        // Space before punctuation
        .replace(/\s+([.,;:!?])/g, '$1')
        // Brackets
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')
        .replace(/\[\s+/g, '[')
        .replace(/\s+\]/g, ']')
        .replace(/\{\s+/g, '{')
        .replace(/\s+\}/g, '}')
        // Quotes
        .replace(/"\s+/g, '"')
        .replace(/\s+"/g, '"')
        .replace(/'\s+/g, "'")
        .replace(/\s+'/g, "'")
        // Final trim (but NO aggressive multi-space collapse – Stage 2 already handled it)
        .trim()
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // STAGE 5 – Semantic Pruning (only when aggressive=true)
  // ──────────────────────────────────────────────────────────────────

  private stage5(text: string, aggressive: boolean): string {
    if (!aggressive) return text;

    const words = text.split(/\s+/);
    const filtered = words.filter((word) => {
      // Keep §-tokens and inline annotations untouched
      if (word.startsWith(TOKEN_PREFIX)) return true;
      // Keep guillemet-wrapped content
      if (word.includes(ANNO_OPEN) || word.includes(ANNO_CLOSE)) return true;
      const clean = word.toLowerCase().replace(/[^\w]/g, '');
      if (clean.length === 0) return true;
      return !STOP_WORDS.has(clean);
    });

    return filtered.join(' ');
  }

  // ──────────────────────────────────────────────────────────────────
  // STAGE 6 – LLM-based Summarization (only when aggressive=true)
  // ──────────────────────────────────────────────────────────────────

  private summarizer: Summarizer = new ApiSummarizer();

  /** Replace the default mock summarizer with a custom backend */
  setSummarizer(s: Summarizer): void {
    this.summarizer = s;
  }

  private async stage6(text: string, aggressive: boolean): Promise<string> {
    if (!aggressive) return text;
    return this.summarizer.summarize(text);
  }

  // ──────────────────────────────────────────────────────────────────
  // MAIN COMPRESS
  // ──────────────────────────────────────────────────────────────────

  /**
   * Run the 6-stage V2 pipeline.
   * @throws if init() was not called.
   */
  async compress(text: string, options: CompressionOptions = {}): Promise<CompressionResult> {
    if (!this.initialized) {
      throw new Error('RAGCompressor not initialized – call init() first.');
    }

    const aggressive = options.aggressive ?? false;
    const original = text;
    const tokStart = tokenCounter.count(original);

    // Stage 1 – Security & Term Substitution
    let current = this.stage1(text);
    const afterStage1 = current;
    const tokAfter1 = tokenCounter.count(current);

    // Stage 2 – Smart Whitespace & JSON Normalization
    current = this.stage2(current);
    const afterStage2 = current;
    const tokAfter2 = tokenCounter.count(current);

    // Stage 3 – Token-Aware N-Gram Compression (inline annotation)
    const {
      result: ngramResult,
      dictionary,
      ngramsFound,
      ngramsReplaced,
      ngramsSkippedROI,
    } = this.stage3(current);
    current = ngramResult;
    const afterStage3 = current;
    const tokAfter3 = tokenCounter.count(current);

    // Stage 4 – Punctuation & Final Cleanup
    current = this.stage4(current);
    const afterStage4 = current;
    const tokAfter4 = tokenCounter.count(current);

    // Stage 5 – Semantic Pruning
    current = this.stage5(current, aggressive);
    const afterStage5 = current;
    const tokAfter5 = tokenCounter.count(current);

    // Stage 6 – LLM-based Summarization
    current = await this.stage6(current, aggressive);
    const afterStage6 = current;
    const tokAfter6 = tokenCounter.count(current);

    // V2: no separate dictionary block – compressedWithDictionary === compressedText
    const compressedWithDictionary = current;

    // Metrics
    const compressedTokens = tokAfter6;
    const ratio = tokStart > 0 ? compressedTokens / tokStart : 1;
    const percentage = tokStart > 0 ? (1 - ratio) * 100 : 0;

    return {
      compressedText: current,
      compressedWithDictionary,
      dictionary,

      originalTokens: tokStart,
      compressedTokens,
      compressionRatio: Math.round(ratio * 1000) / 1000,
      compressionPercentage: Math.round(percentage * 10) / 10,
      savedTokens: tokStart - compressedTokens,

      stages: {
        stage1_security: tokStart - tokAfter1,
        stage2_whitespace: tokAfter1 - tokAfter2,
        stage3_ngrams: tokAfter2 - tokAfter3,
        stage4_cleanup: tokAfter3 - tokAfter4,
        stage5_pruning: tokAfter4 - tokAfter5,
        stage6_summary: tokAfter5 - tokAfter6,
      },

      stageTexts: {
        afterStage1,
        afterStage2,
        afterStage3,
        afterStage4,
        afterStage5,
        afterStage6,
      },

      metadata: {
        originalLength: original.length,
        compressedLength: compressedWithDictionary.length,
        ngramsFound,
        ngramsReplaced,
        ngramsSkippedROI,
      },
    };
  }

  /** Compress multiple texts */
  async compressBatch(texts: string[], options: CompressionOptions = {}): Promise<CompressionResult[]> {
    return Promise.all(texts.map((t) => this.compress(t, options)));
  }
}

// ── Singleton ────────────────────────────────────────────────────────
export const compressor = new RAGCompressor();
