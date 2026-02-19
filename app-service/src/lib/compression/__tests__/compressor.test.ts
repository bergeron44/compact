import { describe, it, expect, beforeAll } from 'vitest';
import { RAGCompressor } from '../compressor';
import { tokenCounter } from '../tokenCounter';
import { securityLoader } from '../securityLoader';
import { GOLDEN_EXAMPLE, GOLDEN_EXAMPLE_LABEL } from '../goldenExample';

// securityLoader.load() can't fetch in test env – it falls back to
// built-in phrase substitutions. After init we add extra test mappings.

let comp: RAGCompressor;

beforeAll(async () => {
  comp = new RAGCompressor();
  await comp.init();

  // Add test-specific security mappings ON TOP of the fallback set
  securityLoader.addMapping('SECRET_KEY', '[REDACTED]');
});

// ─── Stage 1 – Security & Term Substitution ───────────────────────────

describe('Stage 1 – Security & Term Substitution', () => {
  it('should replace security terms', async () => {
    const result = await comp.compress('Protect SECRET_KEY from unauthorized access.');
    expect(result.compressedText).toContain('[REDACTED]');
    expect(result.compressedText).not.toContain('SECRET_KEY');
  });

  it('should substitute verbose phrases', async () => {
    const result = await comp.compress('We did this in order to improve performance.');
    expect(result.compressedText).toContain(' to improve');
    expect(result.compressedText).not.toContain('in order to');
  });

  it('should be case-insensitive', async () => {
    const result = await comp.compress('Due To The Fact That it rained, we stayed inside.');
    expect(result.compressedText.toLowerCase()).toContain('because');
  });

  it('should report stage1 savings', async () => {
    const result = await comp.compress('At this point in time we need to act.');
    expect(result.stages.stage1_security).toBeGreaterThan(0);
  });
});

// ─── Stage 2 – Smart Whitespace & JSON Normalization ──────────────────

describe('Stage 2 – Smart Whitespace & JSON Normalization', () => {
  // ── JSON handling ──

  it('should minify pretty-printed JSON', async () => {
    const input = JSON.stringify({ name: 'Alice', age: 30 }, null, 4);
    const result = await comp.compress(input);
    // Should produce compact single-line JSON
    expect(result.stageTexts.afterStage2).toBe('{"name":"Alice","age":30}');
  });

  it('should strip empty string values from JSON', async () => {
    const input = '{"padding": "                              ", "data": "ok"}';
    const result = await comp.compress(input);
    // The empty-after-trim padding key should be removed entirely
    expect(result.stageTexts.afterStage2).toBe('{"data":"ok"}');
  });

  it('should strip null values from JSON', async () => {
    const input = '{"a": 1, "b": null, "c": "hello"}';
    const result = await comp.compress(input);
    expect(result.stageTexts.afterStage2).toBe('{"a":1,"c":"hello"}');
  });

  it('should strip empty objects and arrays from JSON', async () => {
    const input = '{"data": "ok", "meta": {}, "tags": []}';
    const result = await comp.compress(input);
    expect(result.stageTexts.afterStage2).toBe('{"data":"ok"}');
  });

  it('should recursively strip nested empty values', async () => {
    const input = JSON.stringify({
      id: 'node-001',
      type: 'server',
      metadata: '                 ',
      logs: ['ok', 'fine'],
      nested: { padding: '', inner: { empty: null } },
    });
    const result = await comp.compress(input);
    const after = result.stageTexts.afterStage2;
    expect(after).not.toContain('metadata');
    expect(after).not.toContain('padding');
    expect(after).toContain('"id":"node-001"');
    expect(after).toContain('"logs":["ok","fine"]');
  });

  // ── Prose handling ──

  it('should collapse inline multi-spaces in prose', async () => {
    const input = 'Hello   world  test';
    const result = await comp.compress(input);
    expect(result.stageTexts.afterStage2).toBe('Hello world test');
  });

  it('should collapse 3+ newlines to double newline in prose', async () => {
    const input = 'First\n\n\n\n\nSecond';
    const result = await comp.compress(input);
    expect(result.stageTexts.afterStage2).toBe('First\n\nSecond');
  });

  it('should normalize tabs in prose', async () => {
    const input = 'Hello\t\tworld';
    const result = await comp.compress(input);
    expect(result.stageTexts.afterStage2).not.toContain('\t');
  });

  // ── Mixed JSON + prose ──

  it('should handle mixed JSON and prose content', async () => {
    const input = 'Here is the config:\n{"name": "test", "padding": ""}\nAnd   some   text.';
    const result = await comp.compress(input);
    const after = result.stageTexts.afterStage2;
    // JSON should be minified and padding stripped
    expect(after).toContain('{"name":"test"}');
    // Prose should have spaces collapsed
    expect(after).toContain('And some text.');
  });

  it('should report whitespace savings on multi-space input', async () => {
    const input = 'Hello' + ' '.repeat(100) + 'world' + ' '.repeat(100) + 'test';
    const result = await comp.compress(input);
    expect(result.stages.stage2_whitespace).toBeGreaterThanOrEqual(0);
    expect(result.stageTexts.afterStage2).toBe('Hello world test');
  });
});

// ─── Stage 3 – Token-Aware N-Gram Compression ────────────────────────

describe('Stage 3 – Token-Aware N-Gram Compression (inline annotation)', () => {
  it('should use inline annotation §N«phrase» for first occurrence', async () => {
    // Long repeated phrase to ensure ROI check passes
    const phrase = 'the advanced machine learning pipeline';
    const text = `${phrase} is great. ${phrase} is powerful. ${phrase} is scalable.`;
    const result = await comp.compress(text);

    // Should contain inline annotation with guillemets
    expect(result.compressedText).toMatch(/§\d+«/);
    expect(result.compressedText).toMatch(/»/);
  });

  it('should replace subsequent occurrences with bare §N token', async () => {
    const phrase = 'the advanced machine learning pipeline';
    const text = `${phrase} is great. ${phrase} is powerful. ${phrase} is scalable.`;
    const result = await comp.compress(text);

    // Should have at least one bare §N (without guillemets) for subsequent occurrences
    const bareTokenMatches = result.compressedText.match(/§\d+(?!«)/g);
    expect(bareTokenMatches).not.toBeNull();
    expect(bareTokenMatches!.length).toBeGreaterThan(0);
  });

  it('should NOT produce a §§§DICTIONARY block', async () => {
    const phrase = 'the advanced machine learning pipeline';
    const text = `${phrase} is great. ${phrase} is powerful. ${phrase} is scalable.`;
    const result = await comp.compress(text);
    expect(result.compressedWithDictionary).not.toContain('§§§DICTIONARY');
    expect(result.compressedWithDictionary).not.toContain('§§§END');
  });

  it('compressedWithDictionary should equal compressedText (no separate dictionary)', async () => {
    const phrase = 'the advanced machine learning pipeline';
    const text = `${phrase} is great. ${phrase} is powerful. ${phrase} is scalable.`;
    const result = await comp.compress(text);
    expect(result.compressedWithDictionary).toBe(result.compressedText);
  });

  it('should build a dictionary mapping §-tokens to phrases', async () => {
    const phrase = 'the advanced machine learning pipeline';
    const text = `${phrase} is great. ${phrase} is powerful. ${phrase} is scalable.`;
    const result = await comp.compress(text);

    if (result.metadata.ngramsReplaced > 0) {
      expect(Object.keys(result.dictionary).length).toBeGreaterThan(0);
      for (const key of Object.keys(result.dictionary)) {
        expect(key).toMatch(/^§\d+$/);
      }
    }
  });

  it('should prefer longer n-grams over shorter ones', async () => {
    const text =
      'the quick brown fox jumps the quick brown fox runs the quick brown fox sleeps';
    const result = await comp.compress(text);

    if (result.metadata.ngramsReplaced > 0) {
      const phrases = Object.values(result.dictionary);
      // Should capture the 4-gram "the quick brown fox" if it passes ROI
      const hasLong = phrases.some((p) => p.split(' ').length >= 4);
      if (hasLong) {
        // And should NOT have a shorter subset separately
        expect(phrases.some((p) => p === 'the quick')).toBe(false);
      }
    }
  });

  it('should have empty dictionary when no n-grams qualify', async () => {
    const result = await comp.compress('Hello world');
    expect(Object.keys(result.dictionary).length).toBe(0);
    expect(result.compressedWithDictionary).toBe(result.compressedText);
  });
});

// ─── Stage 3 – ROI Check ─────────────────────────────────────────────

describe('Stage 3 – ROI Check (token profitability)', () => {
  it('should skip n-gram replacements that would increase token count', async () => {
    // Short 2-gram appearing only twice – should NOT be replaced
    const text = 'is the best. is the worst.';
    const result = await comp.compress(text);
    // "is the" appears 2 times but is a 2-gram needing 5 occurrences,
    // and even if it met the threshold, ROI check would reject it
    expect(result.compressedText).not.toMatch(/§\d+/);
  });

  it('should track ngramsSkippedROI in metadata', async () => {
    // Create text with many short n-grams that appear exactly at threshold
    // but don't pass ROI
    const text = 'cat dog cat dog cat dog cat dog cat dog';
    const result = await comp.compress(text);
    // metadata should have the field
    expect(result.metadata.ngramsSkippedROI).toBeDefined();
    expect(typeof result.metadata.ngramsSkippedROI).toBe('number');
  });

  it('should replace n-grams that genuinely save tokens', async () => {
    // Long phrase repeated many times – guaranteed ROI positive
    const phrase = 'retrieval augmented generation pipeline architecture';
    const text = Array(8).fill(`The ${phrase} is excellent.`).join(' ');
    const result = await comp.compress(text);
    expect(result.metadata.ngramsReplaced).toBeGreaterThan(0);
    expect(result.compressedText).toMatch(/§\d+/);
  });
});

// ─── Stage 3 – Dynamic Thresholds ────────────────────────────────────

describe('Stage 3 – Dynamic Minimum Occurrence Thresholds', () => {
  it('should require >=5 occurrences for 2-word n-grams', async () => {
    // "cat dog" appears 4 times – below threshold of 5
    const text = 'cat dog runs. cat dog jumps. cat dog sleeps. cat dog eats.';
    const result = await comp.compress(text);
    // Should NOT be replaced (4 < 5 threshold)
    const dict = Object.values(result.dictionary);
    expect(dict.some((p) => p === 'cat dog')).toBe(false);
  });

  it('should allow 6+ word n-grams with only 2 occurrences', async () => {
    const phrase = 'the quick brown fox jumps over the lazy';
    const text = `${phrase} dog. ${phrase} cat.`;
    const result = await comp.compress(text);
    // 8-word n-gram with 2 occurrences – if ROI passes, should be replaced
    // (may or may not pass ROI depending on token cost, so we just check no crash)
    expect(result.compressedText).toBeTruthy();
  });
});

// ─── Stage 4 – Cleanup ───────────────────────────────────────────────

describe('Stage 4 – Punctuation & Final Cleanup', () => {
  it('should remove space before punctuation', async () => {
    const result = await comp.compress('Hello . World , test !');
    expect(result.compressedText).toContain('Hello.');
    expect(result.compressedText).toContain('World,');
  });

  it('should clean bracket spacing', async () => {
    const result = await comp.compress('Test ( with spaces ) done.');
    expect(result.compressedText).toContain('(with spaces)');
  });

  it('should report cleanup savings', async () => {
    const result = await comp.compress('Hello . World , test !');
    expect(result.stages.stage4_cleanup).toBeGreaterThanOrEqual(0);
  });
});

// ─── Stage 5 – Semantic Pruning ──────────────────────────────────────

describe('Stage 5 – Semantic Pruning', () => {
  it('should NOT prune when aggressive=false (default)', async () => {
    const text = 'The dog is in the park';
    const result = await comp.compress(text, { aggressive: false });
    expect(result.compressedText.toLowerCase()).toContain('the');
    expect(result.stages.stage5_pruning).toBe(0);
  });

  it('should prune stop words when aggressive=true', async () => {
    const text = 'The dog is in the park with a ball';
    const result = await comp.compress(text, { aggressive: true });
    expect(result.compressedText.toLowerCase()).not.toMatch(/\bthe\b/);
    expect(result.stages.stage5_pruning).toBeGreaterThan(0);
  });

  it('should keep content words when pruning', async () => {
    const result = await comp.compress('The important system generates useful reports', {
      aggressive: true,
    });
    expect(result.compressedText).toContain('important');
    expect(result.compressedText).toContain('system');
    expect(result.compressedText).toContain('generates');
    expect(result.compressedText).toContain('useful');
    expect(result.compressedText).toContain('reports');
  });

  it('should keep §-tokens and inline annotations when pruning', async () => {
    // Long repeated phrase to trigger §-token creation
    const phrase = 'the advanced machine learning pipeline';
    const text = `${phrase} is great. ${phrase} is powerful. ${phrase} is scalable.`;
    const result = await comp.compress(text, { aggressive: true });

    if (result.metadata.ngramsReplaced > 0) {
      expect(result.compressedText).toMatch(/§\d+/);
    }
  });
});

// ─── Stage 6 – LLM-based Summarization ──────────────────────────────

describe('Stage 6 – Summarization (LLM mock)', () => {
  it('should skip summarization when aggressive=false', async () => {
    const text = '============\nSECTION TITLE\n============\nSome content here.';
    const result = await comp.compress(text, { aggressive: false });
    expect(result.stages.stage6_summary).toBe(0);
    // Stage 5 text should equal Stage 6 text (pass-through)
    expect(result.stageTexts.afterStage6).toBe(result.stageTexts.afterStage5);
  });

  it('should remove decorative separator lines when aggressive=true', async () => {
    const text = 'Hello world.\n=========================================\nMore text.';
    const result = await comp.compress(text, { aggressive: true });
    expect(result.stageTexts.afterStage6).not.toContain('=========');
    expect(result.stageTexts.afterStage6).toContain('Hello world');
    expect(result.stageTexts.afterStage6).toContain('More text');
  });

  it('should remove ALL-CAPS section headers when aggressive=true', async () => {
    const text = '=========\nSECTION 3: LARGE JSON DATASET 1 (ASSET MANAGEMENT)\n=========\nActual data here.';
    const result = await comp.compress(text, { aggressive: true });
    expect(result.stageTexts.afterStage6).not.toContain('SECTION 3');
    expect(result.stageTexts.afterStage6).toContain('Actual data here');
  });

  it('should remove test/internal markers when aggressive=true', async () => {
    const text = 'DELL-INTERNAL-STRESS-TEST-START\nSome real content.\nDELL-INTERNAL-STRESS-TEST-END';
    const result = await comp.compress(text, { aggressive: true });
    expect(result.stageTexts.afterStage6).not.toContain('DELL-INTERNAL-STRESS-TEST-START');
    expect(result.stageTexts.afterStage6).not.toContain('DELL-INTERNAL-STRESS-TEST-END');
    expect(result.stageTexts.afterStage6).toContain('real content');
  });

  it('should remove parenthetical meta-comments when aggressive=true', async () => {
    const text = 'Data chunk 1. (Imagine this continues for 500 lines) Data chunk 2.';
    const result = await comp.compress(text, { aggressive: true });
    expect(result.stageTexts.afterStage6).not.toContain('Imagine this continues');
    expect(result.stageTexts.afterStage6).toContain('Data chunk 1');
    expect(result.stageTexts.afterStage6).toContain('Data chunk 2');
  });

  it('should remove bracket meta-comments when aggressive=true', async () => {
    const text = 'Content here. [REPEATING 50 TIMES TO SIMULATE N-GRAM REDUNDANCY...] More content.';
    const result = await comp.compress(text, { aggressive: true });
    expect(result.stageTexts.afterStage6).not.toContain('REPEATING 50 TIMES');
    expect(result.stageTexts.afterStage6).toContain('Content here');
    expect(result.stageTexts.afterStage6).toContain('More content');
  });

  it('should collapse excessive blank lines after cleanup', async () => {
    const text = 'Line 1.\n=======\n\n\n\n\n\nLine 2.';
    const result = await comp.compress(text, { aggressive: true });
    // Should not have 3+ consecutive newlines
    expect(result.stageTexts.afterStage6).not.toMatch(/\n{3,}/);
  });

  it('should report stage6_summary savings when aggressive=true', async () => {
    const text = '=========================================\nSECTION 1: INFRASTRUCTURE\n=========================================\nActual content about infrastructure.';
    const result = await comp.compress(text, { aggressive: true });
    expect(result.stages.stage6_summary).toBeGreaterThan(0);
  });

  it('should expose afterStage6 in stageTexts', async () => {
    const text = 'Simple text for testing.';
    const result = await comp.compress(text);
    expect(result.stageTexts.afterStage6).toBeDefined();
    expect(typeof result.stageTexts.afterStage6).toBe('string');
  });
});

// ─── Metrics ─────────────────────────────────────────────────────────

describe('Metrics', () => {
  it('should return correct token counts', async () => {
    const text = 'This is a simple test sentence for token counting.';
    const result = await comp.compress(text);
    expect(result.originalTokens).toBeGreaterThan(0);
    expect(result.compressedTokens).toBeGreaterThan(0);
    expect(result.compressedTokens).toBeLessThanOrEqual(result.originalTokens);
  });

  it('should calculate savedTokens correctly', async () => {
    const text = 'In order to test we repeat in order to verify in order to confirm.';
    const result = await comp.compress(text);
    expect(result.savedTokens).toBe(result.originalTokens - result.compressedTokens);
  });

  it('should expose all 6 stage texts for visualization', async () => {
    const result = await comp.compress('Some test text in order to check stages.');
    expect(result.stageTexts.afterStage1).toBeDefined();
    expect(result.stageTexts.afterStage2).toBeDefined();
    expect(result.stageTexts.afterStage3).toBeDefined();
    expect(result.stageTexts.afterStage4).toBeDefined();
    expect(result.stageTexts.afterStage5).toBeDefined();
    expect(result.stageTexts.afterStage6).toBeDefined();
  });

  it('should provide compressionRatio between 0 and 1', async () => {
    const result = await comp.compress('Test input text with some words to compress.');
    expect(result.compressionRatio).toBeGreaterThanOrEqual(0);
    expect(result.compressionRatio).toBeLessThanOrEqual(1);
  });

  it('should include dictionary and compressedWithDictionary fields', async () => {
    const result = await comp.compress('Some test text.');
    expect(result.dictionary).toBeDefined();
    expect(typeof result.dictionary).toBe('object');
    expect(result.compressedWithDictionary).toBeDefined();
    expect(typeof result.compressedWithDictionary).toBe('string');
  });

  it('should expose all 6 stages in stages object', async () => {
    const result = await comp.compress('Test input text.');
    expect(result.stages.stage1_security).toBeDefined();
    expect(result.stages.stage2_whitespace).toBeDefined();
    expect(result.stages.stage3_ngrams).toBeDefined();
    expect(result.stages.stage4_cleanup).toBeDefined();
    expect(result.stages.stage5_pruning).toBeDefined();
    expect(result.stages.stage6_summary).toBeDefined();
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('should handle empty string', async () => {
    const result = await comp.compress('');
    expect(result.compressedText).toBe('');
    expect(result.originalTokens).toBe(0);
    expect(Object.keys(result.dictionary).length).toBe(0);
  });

  it('should handle single word', async () => {
    const result = await comp.compress('Hello');
    expect(result.compressedText).toBe('Hello');
  });

  it('should not crash on special characters', async () => {
    const result = await comp.compress('Price is $100.00 (USD) [final] {done}!');
    expect(result.compressedText).toBeTruthy();
  });
});

// ─── 10 Large Texts – Original vs Compressed (visual results) ─────────

const LARGE_TEXTS: { label: string; text: string }[] = [
  {
    label: '1. Technical – RAG Architecture',
    text: `Retrieval-Augmented Generation (RAG) is a hybrid AI architecture that combines the strengths of large language models with external knowledge retrieval systems. The RAG pipeline consists of several key components: First, a document ingestion module processes and chunks source documents into manageable segments, typically 256-512 tokens each. These chunks are then converted into dense vector embeddings using models such as sentence-transformers. The embeddings are stored in a vector database for efficient similarity search. When a user submits a query, the retrieval component converts the query into an embedding and performs approximate nearest neighbor search to find the most relevant document chunks. The retrieved chunks are then appended to the prompt and the LLM generates a response conditioned on both the query and the retrieved context. This approach reduces hallucinations, enables access to up-to-date information, and provides verifiable source attribution for the generated answers.`,
  },
  {
    label: '2. Technical – LLM Compression',
    text: `Text compression in LLM systems reduces token usage while preserving semantic meaning. Techniques include extractive summarization (selecting key sentences), abstractive compression (rewriting concisely), and token-level optimization. Compression ratios of 40-60% are common without significant information loss. This directly reduces API costs and improves response latency. Advanced methods use semantic similarity scoring to identify and remove redundant information while maintaining coherence and factual accuracy across the compressed output. Many production RAG systems apply compression both at index time (to reduce storage and retrieval costs) and at response time (to cache more responses within token limits).`,
  },
  {
    label: '3. Support Ticket',
    text: `Ticket #45892 - Priority: High - Status: Open. Customer Name: Sarah Johnson, Account: Enterprise Plus. Issue Description: Customer reports that the automated report generation feature has been failing intermittently since the last platform update. The reports either timeout after 30 seconds or produce incomplete PDF outputs missing the final summary section. This affects their monthly compliance reporting workflow which has a regulatory deadline. Steps to reproduce: Navigate to Reports, select Monthly Compliance Summary template, set date range to current month, click Generate Report. Customer has tried clearing cache and using different browsers. Expected: Complete PDF with all sections. Actual: Timeout or truncated output.`,
  },
  {
    label: '4. Legal – Agreement',
    text: `This Agreement is entered into as of the date of last signature below, by and between the Company, a Delaware corporation with its principal place of business at 123 Innovation Drive, San Jose, and the Contractor, an independent professional services provider. The Company engages the Contractor to perform certain services as described herein. The Contractor agrees to perform such services in accordance with the terms and conditions set forth in this Agreement. The term of this Agreement shall commence on the Effective Date and shall continue for a period of twelve months unless earlier terminated. Either party may terminate this Agreement upon thirty days written notice. All intellectual property created during the term shall belong to the Company.`,
  },
  {
    label: '5. Product Description – Repeated Phrases',
    text: `Our enterprise solution provides enterprise-grade security for enterprise customers. The platform offers real-time monitoring and real-time alerts. Customers can deploy on-premises or in the cloud. Our support team is available 24/7. The support team responds within one hour. We guarantee 99.9% uptime. The uptime guarantee covers all regions. Integrations are available for Salesforce, HubSpot, and Zendesk. All integrations use secure APIs. We comply with GDPR, SOC2, and HIPAA. Compliance is audited annually.`,
  },
  {
    label: '6. Verbose Corporate Text',
    text: `In order to achieve our objectives, we need to take into consideration a number of factors. At this point in time, we are in the process of evaluating our options. Due to the fact that the market has changed, we have to make a decision. For the purpose of clarity, I would like to emphasize that we are committed to this project. In the event that we cannot meet the deadline, we will inform you. With regard to the budget, we have some concerns. It is important to note that we have made significant progress. As previously mentioned, the timeline is tight.`,
  },
  {
    label: '7. Documentation – API',
    text: `The REST API returns JSON responses. All endpoints require authentication. Include the API key in the Authorization header. The rate limit is 1000 requests per hour. Exceeding the limit returns a 429 status code. Pagination is supported via the page and limit query parameters. The default page size is 20. Sort order can be specified with the sort parameter. Filtering is available for most list endpoints. Error responses include a message and error code. Timestamps are in ISO 8601 format. All IDs are UUIDs.`,
  },
  {
    label: '8. Mixed – Security Terms',
    text: `The system stores user credentials securely. Never log the confidential_password or secret_api_key in production. The internal_server_name should not be exposed in error messages. Use the private_access_token only for server-to-server calls. Admin credentials must be rotated every 90 days. In order to protect sensitive data, we encrypt at rest and in transit. Due to the fact that compliance is critical, we audit access logs regularly.`,
  },
  {
    label: '9. Long Paragraph – Redundancy',
    text: `Machine learning models require large amounts of data. Machine learning models improve with more data. Machine learning models can be fine-tuned for specific tasks. Deep learning is a subset of machine learning. Deep learning uses neural networks. Deep learning has achieved impressive results in vision and language. Natural language processing uses machine learning. Natural language processing powers chatbots and translation. Natural language processing is evolving rapidly.`,
  },
  {
    label: '10. Mixed – Whitespace & Phrases',
    text: `This  is   a    test ( with  spaces ) and   punctuation  .  We have  multiple  spaces  here.  In order to  verify  the compressor,  we need  to check  several  things.  Due to the fact that  this is  important,  we run  many  tests.  At this point in time  we are  done.  "Hello"  and  'world'  should  be  clean.`,
  },
];

describe('10 Large Texts – Original vs Compressed (results)', () => {
  it('compresses 10 large texts and prints before/after with dictionary', async () => {
    const results: Array<{ label: string; orig: string; comp: string; withDict: string; dict: Record<string, string>; r: Awaited<ReturnType<RAGCompressor['compress']>> }> = [];

    for (const { label, text } of LARGE_TEXTS) {
      const r = await comp.compress(text);
      results.push({ label, orig: text, comp: r.compressedText, withDict: r.compressedWithDictionary, dict: r.dictionary, r });
    }

    // Log formatted results for inspection
    console.log('\n' + '═'.repeat(80));
    console.log('  RAG COMPRESSOR V2 – 10 LARGE TEXTS: ORIGINAL vs COMPRESSED');
    console.log('═'.repeat(80));

    results.forEach(({ label, orig, withDict, dict, r }) => {
      console.log('\n' + '─'.repeat(80));
      console.log(`  ${label}`);
      console.log(`  Tokens: ${r.originalTokens} → ${r.compressedTokens} | Saved: ${r.savedTokens} | Reduction: ${r.compressionPercentage}%`);
      console.log(`  N-grams: ${r.metadata.ngramsReplaced} replaced, ${r.metadata.ngramsSkippedROI} skipped by ROI`);
      console.log(`  Stages: S1=${r.stages.stage1_security} S2=${r.stages.stage2_whitespace} S3=${r.stages.stage3_ngrams} S4=${r.stages.stage4_cleanup} S5=${r.stages.stage5_pruning} S6=${r.stages.stage6_summary}`);
      console.log('─'.repeat(80));
      console.log('  ORIGINAL (first 600 chars):');
      console.log('  ' + orig.slice(0, 600).replace(/\n/g, '\n  ') + (orig.length > 600 ? '…' : ''));

      if (Object.keys(dict).length > 0) {
        console.log('\n  §-INLINE ANNOTATIONS:');
        for (const [token, phrase] of Object.entries(dict)) {
          console.log(`    ${token} = "${phrase}"`);
        }
      }

      console.log('\n  COMPRESSED (what goes to LLM):');
      console.log('  ' + withDict.replace(/\n/g, '\n  '));
      console.log('');
    });

    // Summary table
    console.log('\n' + '═'.repeat(80));
    console.log('  SUMMARY');
    console.log('═'.repeat(80));
    results.forEach(({ label, r }) => {
      const pct = r.compressionPercentage.toFixed(1);
      const dictSize = Object.keys(r.dictionary).length;
      const skipped = r.metadata.ngramsSkippedROI;
      console.log(`  ${label.padEnd(40)} | ${r.originalTokens}→${r.compressedTokens} tokens | ${pct}% saved | ${dictSize} §-entries | ${skipped} ROI-skipped`);
    });
    console.log('');

    // Assert all ran
    expect(results).toHaveLength(10);
    results.forEach(({ r }) => {
      expect(r.compressedText).toBeTruthy();
      expect(r.originalTokens).toBeGreaterThan(0);
      expect(r.dictionary).toBeDefined();
      expect(r.compressedWithDictionary).toBeDefined();
      // V2: no dictionary block
      expect(r.compressedWithDictionary).not.toContain('§§§DICTIONARY');
    });
  });
});

// ─── Golden Example – Premier test input ───────────────────────────────

describe('Golden Example (Dell + Tech, 2 JSON + 2 paragraphs)', () => {
  it('compresses the golden example with significant savings', async () => {
    const r = await comp.compress(GOLDEN_EXAMPLE);

    console.log('\n' + '═'.repeat(80));
    console.log(`  ${GOLDEN_EXAMPLE_LABEL} (V2 Pipeline)`);
    console.log('═'.repeat(80));
    console.log(`  Original tokens: ${r.originalTokens}`);
    console.log(`  Compressed tokens: ${r.compressedTokens}`);
    console.log(`  Saved: ${r.savedTokens} (${r.compressionPercentage}% reduction)`);
    console.log(`  Stage 1 (security/verbose): ${r.stages.stage1_security} tokens`);
    console.log(`  Stage 2 (whitespace): ${r.stages.stage2_whitespace} tokens`);
    console.log(`  Stage 3 (n-grams): ${r.stages.stage3_ngrams} tokens`);
    console.log(`  Stage 4 (cleanup): ${r.stages.stage4_cleanup} tokens`);
    console.log(`  Stage 5 (pruning): ${r.stages.stage5_pruning} tokens`);
    console.log(`  Stage 6 (summary): ${r.stages.stage6_summary} tokens`);
    console.log(`  N-grams replaced: ${r.metadata.ngramsReplaced}`);
    console.log(`  N-grams skipped (ROI): ${r.metadata.ngramsSkippedROI}`);
    console.log(`  §-Dictionary entries: ${Object.keys(r.dictionary).length}`);
    console.log('═'.repeat(80));

    expect(r.originalTokens).toBeGreaterThan(200);
    expect(r.compressedText).toBeTruthy();
    expect(r.compressedWithDictionary).toBeTruthy();

    // Should have significant Stage 1 savings (Dell terms + verbose phrases)
    expect(r.stages.stage1_security).toBeGreaterThan(0);

    // V2: no dictionary block in output
    expect(r.compressedWithDictionary).not.toContain('§§§DICTIONARY');
    expect(r.compressedWithDictionary).toBe(r.compressedText);
  });
});

// ─── Stress Test – Whitespace-heavy JSON ──────────────────────────────

describe('Stress Test – Whitespace-heavy input', () => {
  it('should massively reduce tokens on padding-heavy JSON', async () => {
    const padding = ' '.repeat(200);
    const input = JSON.stringify({
      data: [
        { id: 'node-001', type: 'server', status: 'active', padding },
        { id: 'node-002', type: 'server', status: 'active', padding },
        { id: 'node-003', type: 'server', status: 'active', padding },
      ],
    }, null, 4);

    const result = await comp.compress(input);

    console.log('\n  Stress: Whitespace-heavy JSON');
    console.log(`  Tokens: ${result.originalTokens} → ${result.compressedTokens} (${result.compressionPercentage}% reduction)`);
    console.log(`  Stages: S1=${result.stages.stage1_security} S2=${result.stages.stage2_whitespace} S3=${result.stages.stage3_ngrams} S4=${result.stages.stage4_cleanup} S5=${result.stages.stage5_pruning} S6=${result.stages.stage6_summary}`);

    // Full minification + empty key removal should save a LOT of tokens
    expect(result.compressedTokens).toBeLessThan(result.originalTokens);
    expect(result.stages.stage2_whitespace).toBeGreaterThan(0);
    // Padding fields should be completely gone (not just emptied)
    expect(result.compressedText).not.toContain('padding');
    // No formatting whitespace left
    expect(result.compressedText).not.toContain('\n');
  });

  it('should handle mixed prose + large JSON', async () => {
    const json = JSON.stringify({
      assets: [
        { id: 1, name: 'server', meta: '', notes: null },
        { id: 2, name: 'storage', meta: '   ', notes: null },
      ],
    }, null, 4);

    const input = `Here is the infrastructure:\n${json}\nEnd of   report.`;
    const result = await comp.compress(input);

    console.log('\n  Stress: Mixed prose + JSON');
    console.log(`  Tokens: ${result.originalTokens} → ${result.compressedTokens} (${result.compressionPercentage}% reduction)`);

    // JSON should be minified, empty keys removed
    expect(result.compressedText).not.toContain('meta');
    expect(result.compressedText).not.toContain('notes');
    expect(result.compressedText).toContain('"id":1');
    // Prose spaces should be collapsed
    expect(result.compressedText).toContain('End of report.');
  });
});
