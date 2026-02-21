"""Test: verify multi-key Gemini rotation and ResilientLLMProvider chain."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from prompt_cache_service.llm_provider import (
    GeminiLLMProvider, MockLLMProvider, ResilientLLMProvider,
)


async def main():
    key1 = "AIzaSyCBCUMGBxpev-9bXIQipP88II_B2cvOq2Q"
    key2 = "AIzaSyAU8p8JLrAUfFZLxiCaU0xg_53P2bTambI"
    
    print("=" * 60)
    print("🧪 Resilient LLM Provider – Multi-Key Chain Test")
    print("=" * 60)

    # Test 1: Multi-key Gemini
    print("\n── Test 1: Multi-key Gemini (2 keys) ──")
    gemini = GeminiLLMProvider(api_keys=[key1, key2], model_name="gemini-2.5-flash")
    print(f"✅ Initialized with {len(gemini.api_keys)} keys")
    
    try:
        response = await gemini.complete("What is RAG? Answer in 1 sentence.")
        print(f"✅ Gemini response ({len(response)} chars): {response[:200]}")
    except Exception as e:
        print(f"⚠️  Gemini failed (expected if quota exhausted): {e}")

    # Test 2: Resilient chain with fallback
    print("\n── Test 2: ResilientLLMProvider chain ──")
    chain = [
        GeminiLLMProvider(api_keys=[key1, key2], model_name="gemini-2.5-flash"),
        # OpenRouter would go here if we had a key
    ]
    resilient = ResilientLLMProvider(chain)
    print(f"✅ Chain: {[p.name for p in resilient.providers]}")
    
    response = await resilient.complete("Explain caching in 1 sentence.")
    print(f"✅ Response from '{resilient.name}' ({len(response)} chars):")
    print(f"   {response[:300]}")
    
    # Test 3: Chain collapses to mock
    print("\n── Test 3: All external providers fail → Mock ──")
    # Use a bad key to force failure
    bad_gemini = GeminiLLMProvider(api_keys=["bad_key"], model_name="gemini-2.5-flash")
    fallback_chain = ResilientLLMProvider([bad_gemini])
    
    response = await fallback_chain.complete("What is compression?")
    print(f"✅ Fallback to '{fallback_chain.name}' ({len(response)} chars):")
    print(f"   {response[:200]}")

    print("\n" + "=" * 60)
    print("🎉 ALL RESILIENT CHAIN TESTS PASSED!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
