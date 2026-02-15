// ============================================
// TOKEN COUNTER (js-tiktoken, cl100k_base)
// ============================================

import { Tiktoken, getEncoding } from 'js-tiktoken';

class TokenCounter {
  private encoder: Tiktoken | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    console.log('[TokenCounter] Initializing (cl100k_base)...');
    this.encoder = getEncoding('cl100k_base');
    this.initialized = true;
    console.log('[TokenCounter] Ready');
  }

  /** Count tokens. Falls back to rough estimate if encoder not loaded. */
  count(text: string): number {
    if (!text) return 0;
    if (!this.encoder) {
      // Rough estimate: ~4 chars per token
      return Math.ceil(text.length / 4);
    }
    return this.encoder.encode(text).length;
  }

  isReady(): boolean {
    return this.initialized;
  }

  cleanup(): void {
    if (this.encoder) {
      this.encoder.free();
      this.encoder = null;
      this.initialized = false;
    }
  }
}

export const tokenCounter = new TokenCounter();
