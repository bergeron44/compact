"""Quick test: verify the LLM provider module imports and MockLLMProvider works."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from prompt_cache_service.llm_provider import (
    MockLLMProvider,
    GeminiLLMProvider,
    DellGenAILLMProvider,
    LLMProvider,
)


async def main():
    print("=" * 50)
    print("LLM Provider Integration Test")
    print("=" * 50)

    # 1. Test MockLLMProvider
    print("\n🧪 1. MockLLMProvider...")
    mock = MockLLMProvider()
    assert mock.name == "mock"

    r1 = await mock.complete("Tell me about RAG")
    assert "RAG" in r1
    print(f"   ✅ RAG query → {len(r1)} chars")

    r2 = await mock.complete("How does caching work?")
    assert "cache" in r2.lower() or "caching" in r2.lower()
    print(f"   ✅ Cache query → {len(r2)} chars")

    r3 = await mock.complete("What is a LLM?")
    assert "Language Model" in r3 or "LLM" in r3
    print(f"   ✅ LLM query → {len(r3)} chars")

    r4 = await mock.complete("random question")
    assert len(r4) > 0
    print(f"   ✅ Default query → {len(r4)} chars")

    # 2. Test GeminiLLMProvider init (no real call)
    print("\n🧪 2. GeminiLLMProvider init...")
    gemini = GeminiLLMProvider(api_key="test_key", model_name="gemini-2.0-flash")
    assert gemini.name == "gemini"
    assert "gemini-2.0-flash" in gemini.base_url
    print("   ✅ Initialized with correct URL")

    # 3. Verify abstract class
    print("\n🧪 3. Abstract base class...")
    assert issubclass(MockLLMProvider, LLMProvider)
    assert issubclass(GeminiLLMProvider, LLMProvider)
    assert issubclass(DellGenAILLMProvider, LLMProvider)
    print("   ✅ All providers inherit from LLMProvider")

    # 4. Test with system prompt
    print("\n🧪 4. System prompt support...")
    r5 = await mock.complete("What is RAG?", system_prompt="You are a helpful assistant")
    assert len(r5) > 0
    print(f"   ✅ System prompt accepted → {len(r5)} chars")

    print("\n" + "=" * 50)
    print("✅ ALL TESTS PASSED (4/4)")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
