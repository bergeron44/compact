import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class EmbeddingEngine(ABC):
    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        ...


class PlaceholderEmbeddingProvider(EmbeddingEngine):
    """Stub that returns a fixed-dimension zero vector. Replace with a real provider."""

    def __init__(self, dim: int = 384):
        self.dim = dim
        logger.info("Initialized PlaceholderEmbeddingProvider with dim=%d", dim)

    async def embed(self, text: str) -> list[float]:
        logger.debug("Generating placeholder embedding for text length=%d", len(text))
        return [0.0] * self.dim
