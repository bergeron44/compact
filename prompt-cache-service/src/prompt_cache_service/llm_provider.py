import logging
from abc import ABC, abstractmethod
from typing import List, Union

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
            model_name,
            len(self.api_keys),
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
            contents.append(
                {
                    "role": "user",
                    "parts": [{"text": f"[System Instruction]\n{system_prompt}"}],
                }
            )
            contents.append(
                {
                    "role": "model",
                    "parts": [
                        {"text": "Understood. I will follow those instructions."}
                    ],
                }
            )
        contents.append(
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        )

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
                        attempt + 1,
                        len(self.api_keys),
                    )
                    last_error = Exception(f"Gemini rate-limited (key {attempt + 1})")
                    continue

                if response.status_code != 200:
                    logger.error(
                        "Gemini error: %s – %s", response.status_code, response.text
                    )
                    raise Exception(f"Gemini returned status {response.status_code}")

                data = response.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]

            except httpx.HTTPError as e:
                logger.warning("Gemini network error with key %d: %s", attempt + 1, e)
                last_error = e
                continue

        # All keys exhausted
        raise last_error or Exception("All Gemini API keys exhausted")


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
