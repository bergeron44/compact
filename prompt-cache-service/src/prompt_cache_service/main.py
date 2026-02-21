"""Main FastAPI application for prompt cache service."""

import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from prompt_cache_service.db_handler.cache_db_handler import ChromaDbHandler
from prompt_cache_service.db_handler.embedding import initialize_embeddings_provider
from prompt_cache_service.extraction import PlaceholderExtractionModel
from prompt_cache_service.router import router
from prompt_cache_service.dell_certs import update_certifi_with_dell_certs
from prompt_cache_service.llm_provider import (
    GeminiLLMProvider,
    MockLLMProvider,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv(".env", override=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager.

    Handles startup and shutdown tasks including:
    - Dell certificate installation
    - Embedding provider initialization
    - ChromaDB cache handler setup
    """
    logger.info("Starting prompt_cache_service")

    # Update certifi bundle with Dell certificates (one-time operation)
    update_certifi_with_dell_certs()

    # Initialize embedding provider with smart fallback:
    # Priority: HuggingFace (if key exists) > Placeholder
    embedding_provider = initialize_embeddings_provider()

    # Initialize ChromaDB cache handler
    chroma_persist_dir = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")
    cache_handler = ChromaDbHandler(
        embed_engine=embedding_provider, persist_dir=chroma_persist_dir
    )

    app.state.cache_handler = cache_handler
    app.state.embedding_provider = embedding_provider
    app.state.extraction_model = PlaceholderExtractionModel()

    # ── Initialize LLM provider (Resilient Chain) ────────────────────
    # Build a chain of providers: Gemini → Mock
    # ResilientLLMProvider tries each in order; Mock always last.

    chain: list = []

    # 1. Gemini (supports multiple comma-separated API keys)
    gemini_keys_raw = os.getenv("GEMINI_API_KEY", "")
    gemini_keys = [k.strip() for k in gemini_keys_raw.split(",") if k.strip()]
    if gemini_keys:
        try:
            gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
            chain.append(
                GeminiLLMProvider(api_keys=gemini_keys, model_name=gemini_model)
            )
            logger.info("✅ Gemini added to chain (%d key(s))", len(gemini_keys))
        except Exception as e:
            logger.warning(f"Gemini init failed: {e}")


    # 2. Mock always added as final fallback by ResilientLLMProvider
    llm_provider = MockLLMProvider()
    app.state.llm_provider = llm_provider

    yield

    logger.info("Shutting down prompt_cache_service")


app = FastAPI(
    title="Prompt Cache Service (Dell GenAI)",
    description="Caching service with Dell GenAI embeddings and ChromaDB storage",
    version="0.1.0",
    lifespan=lifespan,
)

# Add CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
