import logging
import os
from abc import ABC, abstractmethod
import httpx

logger = logging.getLogger(__name__)


class EmbeddingProvider(ABC):
    """Abstract base class for embedding engines."""

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        """Generate embedding vector for the given text.

        Args:
            text: Input text to embed

        Returns:
            List of floats representing the embedding vector
        """
        ...


class HuggingFaceEmbeddingProvider(EmbeddingProvider):
    """HuggingFace embedding provider using Inference API.

    Temporary fallback option using the existing HuggingFace infrastructure.
    This allows testing with real embeddings before Dell credentials are available.
    """

    def __init__(self):
        """Initialize HuggingFace embedding provider.

        Raises:
            ValueError: If API key is missing
        """
        self._api_key = os.getenv("HUGGINGFACEHUB_API_KEY")
        if not self._api_key:
            raise ValueError(
                "HUGGINGFACEHUB_API_KEY must be provided as an environment variable."
            )
        model_name = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")

        # Use the router endpoint which is more reliable for serverless inference
        self.api_url = f"https://router.huggingface.co/hf-inference/models/{model_name}"
        logger.info(
            f"Initialized HuggingFace embedding provider with model: {model_name}"
        )

    async def embed(self, text: str) -> list[float]:
        """Generate embedding using HuggingFace Inference API.

        Args:
            text: Input text to embed

        Returns:
            Embedding vector as list of floats

        Raises:
            Exception: If embedding generation fails
        """
        try:
            headers = {"Authorization": f"Bearer {self._api_key}"}
            payload = {"inputs": text}

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.api_url, headers=headers, json=payload, timeout=60.0
                )

                if response.status_code != 200:
                    logger.error(
                        f"HuggingFace API error: {response.status_code} - {response.text}"
                    )
                    raise Exception(
                        f"HuggingFace API returned status {response.status_code}"
                    )

                # HuggingFace returns nested list, take first element
                embedding = response.json()
                if isinstance(embedding, list) and len(embedding) > 0:
                    if isinstance(embedding[0], list):
                        embedding = embedding[0]  # Extract first embedding

                logger.debug(
                    f"Generated HuggingFace embedding of dimension {len(embedding)}"
                )
                return embedding

        except Exception as e:
            logger.error(f"HuggingFace embedding generation failed: {e}")
            raise


class PlaceholderEmbeddingProvider(EmbeddingProvider):
    """Stub for testing. DO NOT USE IN PRODUCTION.

    Returns zero vectors of specified dimension.
    """

    def __init__(self, dim: int = 384):
        """Initialize placeholder provider.

        Args:
            dim: Dimension of the zero vector to return
        """
        self.dim = dim
        logger.warning("Using PlaceholderEmbeddingProvider - FOR TESTING ONLY")

    async def embed(self, text: str) -> list[float]:
        """Return zero vector.

        Args:
            text: Ignored

        Returns:
            Zero vector of dimension self.dim
        """
        return [0.0] * self.dim


def initialize_embeddings_provider() -> EmbeddingProvider:
    try:
        embedding_provider = HuggingFaceEmbeddingProvider()
        logger.info("✅ Using HuggingFace embeddings")
        return embedding_provider
    except Exception as e:
        logger.warning(f"HuggingFace initialization failed: {e}")

    logger.warning("⚠️  Falling back to PlaceholderEmbeddingProvider (zero vectors)")
    logger.warning(
        "⚠️  Set HUGGINGFACEHUB_API_KEY or Dell credentials for real embeddings"
    )

    return PlaceholderEmbeddingProvider(dim=384)
