const responses: Record<string, string> = {
  rag: "RAG (Retrieval-Augmented Generation) is a technique that enhances LLM outputs by retrieving relevant documents from a knowledge base before generating a response. It combines the strengths of retrieval-based systems with generative models. The process involves three stages: indexing documents into a vector store, retrieving relevant chunks based on query similarity, and augmenting the LLM prompt with retrieved context. This approach reduces hallucinations, enables access to up-to-date information, and provides verifiable source attribution. RAG systems typically use embedding models like sentence-transformers to create vector representations of both documents and queries, enabling semantic search capabilities.",
  compression:
    "Text compression in LLM systems reduces token usage while preserving semantic meaning. Techniques include extractive summarization (selecting key sentences), abstractive compression (rewriting concisely), and token-level optimization. Compression ratios of 40-60% are common without significant information loss. This directly reduces API costs and improves response latency. Advanced methods use semantic similarity scoring to identify and remove redundant information while maintaining coherence and factual accuracy across the compressed output.",
  cache:
    "Semantic caching stores LLM responses indexed by the semantic meaning of queries rather than exact string matches. When a new query arrives, its embedding is compared against cached query embeddings using cosine similarity. If a match exceeds the similarity threshold (typically 0.85), the cached response is returned instantly. This dramatically reduces API calls and costs for repeated or similar queries. Cache invalidation strategies include TTL-based expiration, manual purging, and confidence-based refresh policies.",
  llm: "Large Language Models (LLMs) are deep neural networks trained on vast text corpora to generate human-like text. Modern LLMs like GPT-4, Claude, and Llama use transformer architectures with attention mechanisms. Key capabilities include text generation, summarization, translation, code generation, and reasoning. LLMs process text as tokens and have context window limits. Fine-tuning and prompt engineering are common techniques to optimize LLM performance for specific use cases. Cost optimization strategies include batching, caching, and compression.",
  default:
    "Thank you for your query. Based on the available knowledge base, here is a comprehensive response covering the key aspects of your question. The system has analyzed relevant documents and synthesized the following information. For more specific results, try refining your query with targeted keywords related to your project domain. The RAG pipeline has processed multiple document chunks to generate this contextual response with high relevance scoring.",
};

export function simulateLLMResponse(query: string): Promise<string> {
  return new Promise((resolve) => {
    const q = query.toLowerCase();
    let response = responses.default;

    if (q.includes("rag") || q.includes("retrieval")) response = responses.rag;
    else if (q.includes("compress")) response = responses.compression;
    else if (q.includes("cache") || q.includes("caching")) response = responses.cache;
    else if (q.includes("llm") || q.includes("language model") || q.includes("gpt"))
      response = responses.llm;

    const delay = 800 + Math.random() * 1200;
    setTimeout(() => resolve(response), delay);
  });
}
