import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class ExtractionModel(ABC):
    @abstractmethod
    async def extract(self, prompt: str, response: str) -> list[dict]:
        """Extract key-value pairs from a prompt/response pair.

        Returns a list of dicts, each with 'key' and 'value' string fields.
        """
        ...


class PlaceholderExtractionModel(ExtractionModel):
    """Stub returning an empty list. Replace with a real extraction model."""

    async def extract(self, prompt: str, response: str) -> list[dict]:
        logger.debug("PlaceholderExtractionModel.extract called — returning empty list")
        return []
