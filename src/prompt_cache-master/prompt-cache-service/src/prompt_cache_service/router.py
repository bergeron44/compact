from __future__ import annotations
"""API router for cache service endpoints."""
import logging
from fastapi import APIRouter, Request, HTTPException

from .models import (
    CacheLookupRequest,
    CacheLookupResponse,
    CacheLookupResult,
    DataInsertionRequest,
    DataInsertionResponse,
    LLMCompletionRequest,
    LLMCompletionResponse,
    StoredEntry,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
async def health():
    """Health check endpoint.
    
    Returns:
        dict: Status message
    """
    return {"status": "ok"}


@router.post("/cache/lookup", response_model=CacheLookupResponse)
async def cache_lookup(body: CacheLookupRequest, request: Request):
    """Lookup cached prompt by similarity search.
    
    Args:
        body: Cache lookup request
        request: FastAPI request object
        
    Returns:
        Cache lookup response with matching entries
        
    Raises:
        HTTPException: If lookup fails
    """
    logger.info("Lookup request: project_id=%s, user_id=%s", body.project_id, body.user_id)
    
    cache_handler = request.app.state.cache_handler
    
    try:
        # Create project namespace if it doesn't exist
        if body.project_id not in cache_handler.project_namespaces:
            cache_handler.create_project_namespace(body.project_id)
        
        # Lookup cached prompt
        entry = await cache_handler.lookup_prompt(body.project_id, body.prompt)
        
        if entry:
            # Return ALL fields including compression metrics
            results = [CacheLookupResult(
                key=entry.prompt,
                value=entry.answer,
                score=1.0,
                compressed_prompt=entry.compressed_prompt,
                compression_ratio=entry.compression_ratio,
                original_tokens=entry.original_tokens,
                compressed_tokens=entry.compressed_tokens,
                hit_count=entry.times_accessed,
                created_at=entry.created_at.isoformat(),
                last_accessed=entry.last_accessed_at.isoformat(),
                employee_id=entry.user_id,
            )]
            logger.info(
                "Lookup HIT: project_id=%s, entry_id=%s, compression=%d%%, tokens=%d→%d",
                body.project_id, entry.entry_id, entry.compression_ratio,
                entry.original_tokens, entry.compressed_tokens
            )
            return CacheLookupResponse(found=True, results=results)
        else:
            logger.info("Lookup MISS: project_id=%s", body.project_id)
            return CacheLookupResponse(found=False, results=[])
    
    except Exception as e:
        logger.error("Lookup error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/insert", response_model=DataInsertionResponse)
async def cache_insert(body: DataInsertionRequest, request: Request):
    """Insert new entry into cache with compression metrics.
    
    Args:
        body: Data insertion request
        request: FastAPI request object
        
    Returns:
        Data insertion response
        
    Raises:
        HTTPException: If insertion fails
    """
    logger.info(
        "Insert request: project_id=%s, user_id=%s, compression=%d%%, tokens=%d→%d",
        body.project_id, body.user_id, body.compression_ratio,
        body.original_tokens, body.compressed_tokens
    )
    
    cache_handler = request.app.state.cache_handler
    
    try:
        # Create project namespace if it doesn't exist
        if body.project_id not in cache_handler.project_namespaces:
            cache_handler.create_project_namespace(body.project_id)
        
        # Cache with ALL compression metrics
        entry_id = await cache_handler.cache_prompt(
            project_id=body.project_id,
            user_id=body.user_id,
            prompt=body.prompt,
            answer=body.response,
            compressed_prompt=body.compressed_prompt,
            compression_ratio=body.compression_ratio,
            original_tokens=body.original_tokens,
            compressed_tokens=body.compressed_tokens,
        )
        
        if entry_id:
            stored = [StoredEntry(key=body.prompt, value=body.response)]
            logger.info("Insert SUCCESS: project_id=%s, entry_id=%s", body.project_id, entry_id)
            return DataInsertionResponse(stored_entries=stored)
        else:
            logger.error("Insert FAILED: project_id=%s", body.project_id)
            return DataInsertionResponse(stored_entries=[])
    
    except Exception as e:
        logger.error("Insert error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/llm/complete", response_model=LLMCompletionResponse)
async def llm_complete(body: LLMCompletionRequest, request: Request):
    """Send a prompt to the configured LLM provider and return the response.
    
    Args:
        body: LLM completion request with prompt and optional system_prompt
        request: FastAPI request object
        
    Returns:
        LLM completion response with generated text and provider name
        
    Raises:
        HTTPException: If completion fails
    """
    logger.info("LLM completion request: provider=%s, prompt_len=%d",
                request.app.state.llm_provider.name, len(body.prompt))
    
    llm_provider = request.app.state.llm_provider
    
    try:
        response_text = await llm_provider.complete(body.prompt, body.system_prompt)
        
        logger.info("LLM completion SUCCESS: provider=%s, response_len=%d",
                     llm_provider.name, len(response_text))
        
        return LLMCompletionResponse(
            response=response_text,
            provider=llm_provider.name,
        )
    
    except Exception as e:
        logger.error("LLM provider '%s' failed: %s – falling back to mock", llm_provider.name, e)
        
        # Runtime fallback to MockLLMProvider if the primary provider fails
        if llm_provider.name != "mock":
            try:
                from .llm_provider import MockLLMProvider
                mock = MockLLMProvider()
                response_text = await mock.complete(body.prompt, body.system_prompt)
                logger.info("Mock fallback SUCCESS: response_len=%d", len(response_text))
                return LLMCompletionResponse(
                    response=response_text,
                    provider="mock-fallback",
                )
            except Exception as fallback_err:
                logger.error("Mock fallback also failed: %s", fallback_err)
        
        raise HTTPException(status_code=500, detail=str(e))


# ─── Legacy-compatible Embedding API ────────────────────────────
# These endpoints mirror the old Node.js server/index.js contract
# so the frontend embedApi.ts works via the Vite proxy.
# ─────────────────────────────────────────────────────────────────

from pydantic import BaseModel


class EmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embedding: list[float]
    model: str
    dimensions: int


@router.post("/api/embed", response_model=EmbedResponse)
async def api_embed(body: EmbedRequest, request: Request):
    """Generate an embedding vector for the given text.

    Compatible with the legacy Node.js /api/embed endpoint.
    """
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail='Missing or invalid "text" field')

    embedding_provider = request.app.state.embedding_provider
    try:
        vector = await embedding_provider.embed(body.text)
        model_name = getattr(embedding_provider, "model_name", "unknown")
        return EmbedResponse(
            embedding=vector,
            model=model_name,
            dimensions=len(vector),
        )
    except Exception as e:
        logger.error("Embedding error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/health")
async def api_health(request: Request):
    """Legacy health check that also reports model configuration."""
    embedding_provider = request.app.state.embedding_provider
    model_name = getattr(embedding_provider, "model_name", "unknown")
    return {
        "status": "ok",
        "model": model_name,
        "hasApiKey": True,
    }
