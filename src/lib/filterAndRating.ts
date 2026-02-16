// ============================================
// FILTER & RATE  –  Prompt classification + quality rating
// ============================================
//
// Provides an abstraction over a prompt classifier/rater.
// Currently ships with a deterministic MockPromptClassifier;
// swap in a real LLM backend later by implementing the
// PromptClassifier interface (see ApiPromptClassifier example).
//
// Pattern matches: compression/summarizer.ts (Summarizer interface)
// ============================================

import { ratePrompt } from './mockLLM';

// ============================================
// INTERFACE
// ============================================

export interface FilterRateResult {
  shouldCache: boolean;
  rating: number;      // 1–10
  reason: string;
}

/**
 * Interface for a prompt classifier + rater.
 * Implementations may call a local/remote LLM or use deterministic rules (mock).
 *
 * To swap in a real LLM later, implement this interface and call:
 *   `promptClassifier.setBackend(new ApiPromptClassifier())`
 */
export interface PromptClassifier {
  filterAndRate(prompt: string): Promise<FilterRateResult>;
}

// ============================================
// MOCK IMPLEMENTATION  (deterministic, no API needed)
// ============================================

/**
 * Mock classifier that uses heuristic regex rules + the existing
 * `ratePrompt` scorer to simulate what an LLM classifier would produce.
 *
 * Filter logic:
 *   - Checks for instruction patterns (EN + HE) → shouldCache = false
 *   - Checks for question/information patterns  → shouldCache = true
 *   - Defaults to shouldCache = false (conservative)
 *
 * Rating logic:
 *   - Delegates to `ratePrompt()` from mockLLM.ts
 */
export class MockPromptClassifier implements PromptClassifier {
  async filterAndRate(prompt: string): Promise<FilterRateResult> {
    const lower = prompt.toLowerCase();

    // ── shouldCache heuristic ──────────────────────────────
    // Instruction / code requests → don't cache
    const instructionPatterns = [
      // English
      /\bwrite\b.*\b(code|function|class|script|test)\b/,
      /\bimplement\b/,
      /\bcreate\b.*\b(file|component|module|endpoint)\b/,
      /\bgenerate\b.*\bcode\b/,
      /\brefactor\b/,
      /\bfix\b.*\b(bug|error|issue)\b/,
      /\bdo\b.*\b(this|that|it)\b/,
      /\bmake\b.*\b(change|update|function)\b/,
      /\badd\b.*\b(feature|field|endpoint|route)\b/,
      /\bdelete\b/,
      /\bremove\b/,
      // Hebrew
      /תכתוב/,
      /תעשה/,
      /תיצור/,
      /תתקן/,
      /תשנה/,
      /תוסיף/,
      /בקוד/,
      /תמחק/,
    ];

    const isInstruction = instructionPatterns.some((p) => p.test(lower));

    // Information / exploration → cache-eligible
    const questionPatterns = [
      /\bwhat\b/,
      /\bhow\b/,
      /\bwhy\b/,
      /\bexplain\b/,
      /\bdescribe\b/,
      /\bcompare\b/,
      /\bdifference\b/,
      /\?\s*$/,
      /מה\s/,
      /איך\s/,
      /למה\s/,
      /הסבר/,
      /תסביר/,
    ];

    const isQuestion = questionPatterns.some((p) => p.test(lower));
    const shouldCache = !isInstruction && isQuestion;

    // ── rating via existing ratePrompt ───────────────────
    const { score, reason } = ratePrompt(prompt);

    // Simulate async delay like a real LLM would have
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));

    return { shouldCache, rating: score, reason };
  }
}

// ============================================
// SINGLETON  (swappable backend)
// ============================================

/**
 * Central prompt classifier instance.
 * Uses MockPromptClassifier by default.
 * To switch to a real LLM backend:
 *
 * ```ts
 * import { promptClassifier, ApiPromptClassifier } from '@/lib/filterAndRating';
 * promptClassifier.setBackend(new ApiPromptClassifier());
 * ```
 */
class PromptClassifierService {
  private backend: PromptClassifier = new MockPromptClassifier();

  /** Replace the default mock classifier with a custom backend */
  setBackend(classifier: PromptClassifier) {
    this.backend = classifier;
  }

  /** Get the current backend (for testing/inspection) */
  getBackend(): PromptClassifier {
    return this.backend;
  }

  /** Classify and rate a prompt using the current backend */
  async filterAndRate(prompt: string): Promise<FilterRateResult> {
    return this.backend.filterAndRate(prompt);
  }
}

export const promptClassifier = new PromptClassifierService();

// ============================================
// API IMPLEMENTATION  (for future use)
// ============================================
//
// Example implementation that calls POST /api/filter-and-rate.
// Uncomment and use when you have a real LLM backend:
//
// ```ts
// const API_BASE = import.meta.env.VITE_EMBED_API_URL || '/api';
//
// export class ApiPromptClassifier implements PromptClassifier {
//   private timeoutMs: number;
//
//   constructor(timeoutMs = 3000) {
//     this.timeoutMs = timeoutMs;
//   }
//
//   async filterAndRate(prompt: string): Promise<FilterRateResult> {
//     const controller = new AbortController();
//     const timer = setTimeout(() => controller.abort(), this.timeoutMs);
//
//     const res = await fetch(`${API_BASE}/filter-and-rate`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ prompt }),
//       signal: controller.signal,
//     });
//     clearTimeout(timer);
//
//     if (!res.ok) throw new Error(`API returned ${res.status}`);
//     const data = await res.json();
//
//     // Validate + clamp
//     return {
//       shouldCache: Boolean(data.shouldCache),
//       rating: Math.max(1, Math.min(10, Math.round(data.rating))),
//       reason: String(data.reason ?? ''),
//     };
//   }
// }
// ```
//
// To activate:
//   promptClassifier.setBackend(new ApiPromptClassifier());
//
// The server endpoint already exists at POST /api/filter-and-rate
// in server/index.js.

// ============================================
// CONVENIENCE EXPORTS
// ============================================

/**
 * Convenience function — calls the current backend.
 * This is the main function to use from Chat.tsx.
 */
export async function filterAndRatePrompt(prompt: string): Promise<FilterRateResult> {
  return promptClassifier.filterAndRate(prompt);
}

/**
 * Direct local-only fallback (always uses mock, ignoring
 * whatever backend is configured). Useful as a guaranteed
 * fallback if the API call fails.
 */
const mockFallback = new MockPromptClassifier();
export function filterAndRateLocal(prompt: string): Promise<FilterRateResult> {
  return mockFallback.filterAndRate(prompt);
}
