import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from prompt_cache_service.cache_store import CacheStore
from prompt_cache_service.embedding import PlaceholderEmbeddingProvider
from prompt_cache_service.extraction import PlaceholderExtractionModel
from prompt_cache_service.router import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting prompt_cache_service")
    app.state.cache_store = CacheStore()
    app.state.embedding_provider = PlaceholderEmbeddingProvider()
    app.state.extraction_model = PlaceholderExtractionModel()
    yield
    logger.info("Shutting down prompt_cache_service")


app = FastAPI(title="Prompt Cache Service", lifespan=lifespan)
app.include_router(router)
