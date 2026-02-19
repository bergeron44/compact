// ============================================
// COMPRESSION TYPES  (V2 – 6-stage pipeline)
// ============================================

/** Mapping of original terms to their replacements (security redaction + phrase optimization) */
export interface SecurityMappings {
  [originalTerm: string]: string;
}

/** Options for the compression pipeline */
export interface CompressionOptions {
  /** Enable Stage 5 semantic pruning (default: false) */
  aggressive?: boolean;
}

/** Full result returned by the compressor */
export interface CompressionResult {
  // Output
  compressedText: string;
  /**
   * The final output sent to the LLM.
   * In V2 this equals compressedText (inline annotations, no separate dictionary block).
   * Kept for backward compatibility with Chat.tsx / cache layer.
   */
  compressedWithDictionary: string;
  /** N-gram dictionary mapping §-tokens to original phrases, e.g. { "§1": "machine learning" } */
  dictionary: Record<string, string>;

  // Metrics
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number; // 0.0–1.0 (fraction of original size)
  compressionPercentage: number; // 0–100 (percent reduced)
  savedTokens: number;

  // Per-stage token savings (6 stages)
  stages: {
    stage1_security: number;
    stage2_whitespace: number;
    stage3_ngrams: number;
    stage4_cleanup: number;
    stage5_pruning: number;
    stage6_summary: number;
  };

  // Per-stage intermediate texts (for CompressionView visualization)
  stageTexts: {
    afterStage1: string;
    afterStage2: string;
    afterStage3: string;
    afterStage4: string;
    afterStage5: string;
    afterStage6: string;
  };

  // Debug metadata
  metadata: {
    originalLength: number;
    compressedLength: number;
    ngramsFound: number;
    ngramsReplaced: number;
    ngramsSkippedROI: number;
  };
}
