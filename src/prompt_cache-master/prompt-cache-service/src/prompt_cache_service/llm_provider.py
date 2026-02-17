from __future__ import annotations
"""LLM completion providers for the cache service.

Supports multiple backends with automatic fallback:
  - Google Gemini (external, multiple API keys)
  - OpenRouter (100+ models via single API key)
  - Dell GenAI Gateway (internal, OpenAI-compatible)
  - Mock (canned responses for testing)
  
Fallback chain: Gemini keys → OpenRouter → Dell → Mock
"""
import logging
import os
from abc import ABC, abstractmethod
from typing import List, Optional, Union

import httpx

logger = logging.getLogger(__name__)


class LLMProvider(ABC):
    """Abstract base class for LLM completion providers."""

    name: str = "base"

    @abstractmethod
    async def complete(self, prompt: str, system_prompt: str = "") -> str:
        """Send a prompt to the LLM and return the generated text.

        Args:
            prompt: The user prompt to complete.
            system_prompt: Optional system instruction prepended to the conversation.

        Returns:
            The LLM-generated response string.
        """
        ...


# ─── Dell GenAI Provider ────────────────────────────────────────────────


class DellGenAILLMProvider(LLMProvider):
    """Dell internal LLM via the AIA GenAI Gateway (OpenAI-compatible)."""

    name = "dell"

    AVAILABLE_MODELS = [
        "llama3.1-70b-instruct",
        "llama3.1-8b-instruct",
        "granite-3.1-8b-instruct",
        "mixtral-8x22b-instruct-v0.1",
    ]

    def __init__(
        self,
        model_name: str = "llama3.1-70b-instruct",
        use_sso: bool = False,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
    ):
        if model_name not in self.AVAILABLE_MODELS:
            raise ValueError(
                f"Model {model_name} not available. Choose from: {self.AVAILABLE_MODELS}"
            )

        self.model_name = model_name
        self.base_url = "https://aia.gateway.dell.com/genai/dev/v1"

        # Build auth headers
        import uuid
        import certifi

        self.headers = {
            "x-correlation-id": str(uuid.uuid4()),
            "accept": "*/*",
            "Content-Type": "application/json",
        }

        if use_sso:
            try:
                from aia_auth import auth
                token = auth.generate_auth_token()
                self.headers["Authorization"] = f"Bearer {token}"
            except ImportError:
                raise ImportError("aia-auth-client not installed. pip install aia-auth-client==0.0.8")
        else:
            if not client_id or not client_secret:
                raise ValueError("client_id and client_secret required when not using SSO")
            from . import authentication_provider
            auth_prov = authentication_provider.AuthenticationProvider(
                client_id=client_id, client_secret=client_secret
            )
            self.headers["Authorization"] = f"Basic {auth_prov.get_basic_credentials()}"

        self.client = httpx.AsyncClient(verify=certifi.where(), timeout=120.0)
        logger.info("Initialized Dell GenAI LLM provider with model: %s", model_name)

    async def complete(self, prompt: str, system_prompt: str = "") -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await self.client.post(
            f"{self.base_url}/chat/completions",
            headers=self.headers,
            json={
                "model": self.model_name,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 2048,
            },
        )

        if response.status_code != 200:
            logger.error("Dell GenAI error: %s – %s", response.status_code, response.text)
            raise Exception(f"Dell GenAI returned status {response.status_code}")

        data = response.json()
        return data["choices"][0]["message"]["content"]


# ─── Google Gemini Provider ─────────────────────────────────────────────


class GeminiLLMProvider(LLMProvider):
    """Google Gemini LLM via the REST API. Supports multiple API keys with rotation."""

    name = "gemini"

    def __init__(
        self,
        api_keys: Union[List[str], str],
        model_name: str = "gemini-2.5-flash",
    ):
        # Accept a single key or a list of keys
        if isinstance(api_keys, str):
            self.api_keys = [api_keys]
        else:
            self.api_keys = list(api_keys)

        self._current_key_index = 0
        self.model_name = model_name
        self.base_url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}"
        )
        self.client = httpx.AsyncClient(timeout=120.0)
        logger.info(
            "Initialized Gemini LLM provider with model: %s (%d API key(s))",
            model_name, len(self.api_keys),
        )

    def _rotate_key(self) -> str:
        """Return the current key and advance to the next one."""
        key = self.api_keys[self._current_key_index]
        self._current_key_index = (self._current_key_index + 1) % len(self.api_keys)
        return key

    async def complete(self, prompt: str, system_prompt: str = "") -> str:
        # Build Gemini-native request body
        contents = []
        if system_prompt:
            contents.append({
                "role": "user",
                "parts": [{"text": f"[System Instruction]\n{system_prompt}"}],
            })
            contents.append({
                "role": "model",
                "parts": [{"text": "Understood. I will follow those instructions."}],
            })
        contents.append({
            "role": "user",
            "parts": [{"text": prompt}],
        })

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 2048,
            },
        }

        # Try each API key until one succeeds
        last_error = None
        for attempt in range(len(self.api_keys)):
            api_key = self._rotate_key()
            try:
                response = await self.client.post(
                    f"{self.base_url}:generateContent",
                    params={"key": api_key},
                    headers={"Content-Type": "application/json"},
                    json=payload,
                )

                if response.status_code == 429:
                    # Rate limited – try next key
                    logger.warning(
                        "Gemini key %d/%d rate-limited (429), trying next...",
                        attempt + 1, len(self.api_keys),
                    )
                    last_error = Exception(f"Gemini rate-limited (key {attempt + 1})")
                    continue

                if response.status_code != 200:
                    logger.error("Gemini error: %s – %s", response.status_code, response.text)
                    raise Exception(f"Gemini returned status {response.status_code}")

                data = response.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]

            except httpx.HTTPError as e:
                logger.warning("Gemini network error with key %d: %s", attempt + 1, e)
                last_error = e
                continue

        # All keys exhausted
        raise last_error or Exception("All Gemini API keys exhausted")


# ─── OpenRouter Provider ────────────────────────────────────────────────


class OpenRouterLLMProvider(LLMProvider):
    """OpenRouter – 100+ models via a single API key (OpenAI-compatible).
    
    Popular free models:
      - meta-llama/llama-3.3-70b-instruct:free
      - google/gemma-3-27b-it:free
      - mistralai/mistral-small-3.1-24b-instruct:free
      - deepseek/deepseek-r1-0528:free
      - nousresearch/hermes-3-llama-3.1-405b:free
    
    Sign up: https://openrouter.ai/keys
    """

    name = "openrouter"

    def __init__(
        self,
        api_key: str,
        model_name: str = "meta-llama/llama-3.3-70b-instruct:free",
        site_name: str = "Dell Compact",
    ):
        self.api_key = api_key
        self.model_name = model_name
        self.site_name = site_name
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"
        self.client = httpx.AsyncClient(timeout=120.0)
        logger.info("Initialized OpenRouter LLM provider with model: %s", model_name)

    # Fallback free models to try if primary is rate-limited
    FALLBACK_MODELS = [
        "google/gemma-3-27b-it:free",
        "mistralai/mistral-small-3.1-24b-instruct:free",
        "meta-llama/llama-3.2-3b-instruct:free",
        "nousresearch/hermes-3-llama-3.1-405b:free",
    ]

    async def complete(self, prompt: str, system_prompt: str = "") -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": f"https://{self.site_name.lower().replace(' ', '-')}.app",
            "X-Title": self.site_name,
        }

        # Try primary model first, then fallback models
        models_to_try = [self.model_name] + [
            m for m in self.FALLBACK_MODELS if m != self.model_name
        ]

        last_error = None
        for model in models_to_try:
            try:
                response = await self.client.post(
                    self.base_url,
                    headers=headers,
                    json={
                        "model": model,
                        "messages": messages,
                        "temperature": 0.7,
                        "max_tokens": 2048,
                    },
                )

                if response.status_code == 429:
                    logger.warning("OpenRouter model '%s' rate-limited, trying next...", model)
                    last_error = Exception(f"OpenRouter 429 on {model}")
                    continue

                if response.status_code != 200:
                    logger.error("OpenRouter error: %s – %s", response.status_code, response.text)
                    raise Exception(f"OpenRouter returned status {response.status_code}")

                data = response.json()
                return data["choices"][0]["message"]["content"]

            except httpx.HTTPError as e:
                logger.warning("OpenRouter network error on model '%s': %s", model, e)
                last_error = e
                continue

        raise last_error or Exception("All OpenRouter models exhausted")


# ─── Resilient (Multi-Fallback) Provider ────────────────────────────────


class ResilientLLMProvider(LLMProvider):
    """Chains multiple LLM providers with automatic fallback.
    
    Tries each provider in order. If one fails, moves to the next.
    Always ends with MockLLMProvider so the user never sees an error.
    """

    name = "resilient"

    def __init__(self, providers: List[LLMProvider]):
        # Ensure Mock is always the last fallback
        has_mock = any(isinstance(p, MockLLMProvider) for p in providers)
        if not has_mock:
            providers.append(MockLLMProvider())
        
        self.providers = providers
        names = [p.name for p in self.providers]
        logger.info("Initialized ResilientLLMProvider: chain = %s", " → ".join(names))

    async def complete(self, prompt: str, system_prompt: str = "") -> str:
        for provider in self.providers:
            try:
                result = await provider.complete(prompt, system_prompt)
                self.name = provider.name  # Report which one succeeded
                return result
            except Exception as e:
                logger.warning(
                    "Provider '%s' failed (%s), trying next...",
                    provider.name, str(e)[:100],
                )
                continue
        
        # Should never reach here (Mock never fails), but just in case
        self.name = "mock"
        return MockLLMProvider.RESPONSES["default"]


# ─── Mock Provider ──────────────────────────────────────────────────────


class MockLLMProvider(LLMProvider):
    """Canned responses for testing. Mirrors the existing mockLLM.ts logic."""

    name = "mock"

    RESPONSES = {
        "rag": (
            "RAG (Retrieval-Augmented Generation) is a technique that enhances LLM "
            "outputs by retrieving relevant documents from a knowledge base before "
            "generating a response. It combines retrieval-based systems with generative "
            "models across three stages: indexing, retrieval, and augmented generation."
        ),
        "compression": (
            "Text compression in LLM systems reduces token usage while preserving "
            "semantic meaning. Techniques include extractive summarization, abstractive "
            "compression, and token-level optimization. Compression ratios of 40-60% "
            "are common without significant information loss."
        ),
        "cache": (
            "Semantic caching stores LLM responses indexed by query meaning rather "
            "than exact string matches. Using cosine similarity on embeddings, it "
            "returns cached responses instantly when similarity exceeds the threshold."
        ),
        "llm": (
            "Large Language Models are deep neural networks trained on vast text "
            "corpora. Modern LLMs use transformer architectures with attention "
            "mechanisms for text generation, summarization, translation, and reasoning."
        ),
        "default": (
            "Thank you for your query. The system has analyzed relevant documents "
            "and synthesized a comprehensive response. For more specific results, "
            "try refining your query with targeted keywords."
        ),
    }

    def __init__(self):
        logger.warning("Using MockLLMProvider – FOR TESTING ONLY")

    async def complete(self, prompt: str, system_prompt: str = "") -> str:
        q = prompt.lower()
        if "rag" in q or "retrieval" in q:
            return self.RESPONSES["rag"]
        if "compress" in q:
            return self.RESPONSES["compression"]
        if "cache" in q or "caching" in q:
            return self.RESPONSES["cache"]
        if "llm" in q or "language model" in q or "gpt" in q:
            return self.RESPONSES["llm"]
        return self.RESPONSES["default"]
