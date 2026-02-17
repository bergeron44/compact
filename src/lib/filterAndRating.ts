// ============================================
// FILTER & RATE  –  Prompt classification + quality rating
// ============================================
//
// Provides an abstraction over a prompt classifier/rater.
// Defaults to ApiPromptClassifier (Real LLM) with Mock fallback.
//
// Pattern matches: compression/summarizer.ts (Summarizer interface)
// ============================================

import { ratePrompt } from './mockLLM';
import { queryLLM } from './llmClient';

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
 */
export interface PromptClassifier {
  filterAndRate(prompt: string): Promise<FilterRateResult>;
}

// ============================================
// MOCK IMPLEMENTATION  (deterministic fallback)
// ============================================

/**
 * Mock classifier that uses heuristic regex rules + the existing
 * `ratePrompt` scorer. Used when the API is unreachable.
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

    return { shouldCache, rating: score, reason };
  }
}

// ============================================
// API IMPLEMENTATION (Real LLM)
// ============================================

export class ApiPromptClassifier implements PromptClassifier {
  private fallback = new MockPromptClassifier();

  async filterAndRate(prompt: string): Promise<FilterRateResult> {
    const systemPrompt = `
You are a Prompt Classifier for a semantic cache system.
Your goal is to decide if a user prompt is worth caching (is it a reusable question?) and rate its quality (1-10).

Output JSON only in this format:
{
  "shouldCache": boolean, // true if it's a general question/explanation, false if it's a specific code request or action
  "rating": number,       // 1-10 based on clarity and detail
  "reason": "string"      // brief explanation
}

Examples:
- "What is RAG?" -> {"shouldCache": true, "rating": 9, "reason": "Clear concept question"}
- "Write a python script to fetch google.com" -> {"shouldCache": false, "rating": 8, "reason": "Specific code generation request"}
- "fix this bug" -> {"shouldCache": false, "rating": 2, "reason": "Vague imperative instruction"}
`;

    try {
      const responseText = await queryLLM(prompt, systemPrompt);

      // Clean up markdown code blocks if present (Gemini sometimes adds them)
      const cleanJson = responseText.replace(/```json\n?|\n?```/g, '').trim();

      const data = JSON.parse(cleanJson);

      return {
        shouldCache: Boolean(data.shouldCache),
        rating: Math.max(1, Math.min(10, Number(data.rating) || 5)),
        reason: String(data.reason || "Rated by LLM"),
      };
    } catch (err) {
      console.warn("ApiPromptClassifier failed, falling back to mock:", err);
      return this.fallback.filterAndRate(prompt);
    }
  }
}

// ============================================
// SINGLETON  (swappable backend)
// ============================================

/**
 * Central prompt classifier instance.
 * Defaults to ApiPromptClassifier (Real LLM).
 */
class PromptClassifierService {
  private backend: PromptClassifier = new ApiPromptClassifier();

  /** Replace the default classifier with a custom backend */
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
 * Direct local-only fallback (always uses mock).
 */
const mockFallback = new MockPromptClassifier();
export function filterAndRateLocal(prompt: string): Promise<FilterRateResult> {
  return mockFallback.filterAndRate(prompt);
}
