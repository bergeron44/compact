from __future__ import annotations
"""API router for cache service endpoints."""
import logging
from fastapi import APIRouter, Request, HTTPException

from .models import (
    CacheLookupRequest,
    CacheLookupResponse,
    CacheLookupResult,
    CacheStatsResponse,
    CacheDeleteRequest,
    CacheClearRequest,
    CacheHitRequest,
    DataInsertionRequest,
    DataInsertionResponse,
    SecurityMappingResponse,
    LLMCompletionRequest,
    LLMCompletionResponse,
    StoredEntry,
    UserRegisterRequest,
    UserResponse,
    PromptActivityRequest,
    PromptActivityResponse,
    VoteRequest,
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
    """Lookup cached prompt by similarity search."""
    logger.info("Lookup request: project_id=%s, user_id=%s, limit=%d", body.project_id, body.user_id, body.limit)
    
    cache_handler = request.app.state.cache_handler
    
    try:
        # Create project namespace if it doesn't exist
        if body.project_id not in cache_handler.project_namespaces:
            try:
                cache_handler.create_project_namespace(body.project_id)
            except ValueError:
                pass
        
        # Lookup cached prompts
        entries = await cache_handler.lookup_prompt(
            body.project_id, 
            body.prompt, 
            limit=body.limit,
            threshold=body.threshold
        )
        
        results = []
        for entry in entries:
            results.append(CacheLookupResult(
                entry_id=entry.entry_id,
                key=entry.prompt,
                value=entry.answer,
                score=entry.score,
                compressed_prompt=entry.compressed_prompt,
                compression_ratio=entry.compression_ratio,
                original_tokens=entry.original_tokens,
                compressed_tokens=entry.compressed_tokens,
                hit_count=entry.times_accessed,
                created_at=entry.created_at.isoformat(),
                last_accessed=entry.last_accessed_at.isoformat(),
                employee_id=entry.user_id,
            ))
            
        if results:
            return CacheLookupResponse(found=True, results=results)
        else:
            return CacheLookupResponse(found=False, results=[])
    
    except Exception as e:
        logger.error("Lookup error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cache/stats", response_model=CacheStatsResponse)
async def cache_stats(project_id: str, request: Request):
    """Get usage statistics for the project."""
    cache_handler = request.app.state.cache_handler
    try:
        stats = cache_handler.get_project_stats(project_id)
        return CacheStatsResponse(
            project_id=project_id,
            total_entries=stats.get("total_entries", 0),
            total_hits=stats.get("total_hits", 0),
            avg_compression=stats.get("avg_compression", 0.0),
        )
    except Exception as e:
        logger.error("Stats error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cache/entries", response_model=list[CacheLookupResult])
async def list_entries(project_id: str, request: Request, limit: int = 100, offset: int = 0):
    """List entries for a project."""
    cache_handler = request.app.state.cache_handler
    try:
        entries = cache_handler.list_entries(project_id, limit, offset)
        results = []
        for entry in entries:
            results.append(CacheLookupResult(
                entry_id=entry.entry_id,
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
            ))
        return results
    except Exception as e:
        logger.error("List entries error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/vote")
async def vote_entry(body: VoteRequest, request: Request):
    """Vote on a cache entry (like/dislike)."""
    cache_handler = request.app.state.cache_handler
    try:
        likes, dislikes = cache_handler.vote_entry(body.project_id, body.entry_id, body.vote_type)
        return {"likes": likes, "dislikes": dislikes}
    except Exception as e:
        logger.error("Vote error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/delete")
async def delete_entries(body: CacheDeleteRequest, request: Request):
    """Delete specific entries."""
    cache_handler = request.app.state.cache_handler
    try:
        count = cache_handler.delete_entries(body.project_id, body.entry_ids)
        return {"deleted": count}
    except Exception as e:
        logger.error("Delete error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/hit")
async def register_cache_hit(body: CacheHitRequest, request: Request):
    """Increment hit count for a cache entry."""
    cache_handler = request.app.state.cache_handler
    try:
        success = cache_handler.increment_entry_hit(body.project_id, body.entry_id)
        if not success:
             raise HTTPException(status_code=404, detail="Entry not found")
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Cache hit update error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/clear")
async def clear_cache(body: CacheClearRequest, request: Request):
    """Clear all entries for a project."""
    cache_handler = request.app.state.cache_handler
    try:
        count = cache_handler.clear_project_cache(body.project_id)
        return {"deleted": count}
    except Exception as e:
        logger.error("Clear cache error: %s", e)
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
        # Check safely without race condition ideally, but here just catching the specific error or key check
        if body.project_id not in cache_handler.project_namespaces:
            try:
                cache_handler.create_project_namespace(body.project_id)
            except ValueError:
                logger.info("Namespace race condition caught for project: %s", body.project_id)
                pass # Already exists, race condition or just created

        
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
                body.provider or request.app.state.llm_provider.name, len(body.prompt))
    
    # Use requested provider if specified, otherwise default
    if body.provider == "free":
         # Force use of Mock provider (or a specific free one if configured)
         from .llm_provider import MockLLMProvider
         llm_provider = MockLLMProvider()
    elif body.provider:
         # In a real app, we might switch factory. For now, we only support switching to 'mock' via 'free'
         # or using the default.
         llm_provider = request.app.state.llm_provider
    else:
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



# ------------------------------------------------------------------
# Security Endpoints
# ------------------------------------------------------------------

SECURITY_MAPPINGS = {
    "confidential_password": "[REDACTED_PWD]",
    "secret_api_key": "[REDACTED_KEY]",
    "internal_server_name": "[REDACTED_SERVER]",
    "private_access_token": "[REDACTED_TOKEN]",
    "admin_credentials": "[REDACTED_CREDS]",
    "in order to": "to",
    "as a result of": "because",
    "due to the fact that": "because",
    "at this point in time": "now",
    "in the event that": "if",
    "for the purpose of": "for",
    "with regard to": "regarding",
    "in spite of the fact that": "although",
    "it is important to note that": "note:",
    "as previously mentioned": "previously",
    "in the context of": "in",
    "with respect to": "regarding",
    "on the basis of": "based on",
    "in accordance with": "per",
    "a large number of": "many",
    "a significant amount of": "much",
    "at the present time": "now",
    "in the near future": "soon",
    "prior to the start of": "before",
    "subsequent to": "after",
    "in the absence of": "without",
    "for the reason that": "because",
    "in light of the fact that": "since",
    "despite the fact that": "although",
    "has the ability to": "can",
    "is able to": "can",
    "make a decision": "decide",
    "take into consideration": "consider",
    "come to the conclusion": "conclude",
    "give an indication of": "indicate",
    "have an effect on": "affect",
    "is indicative of": "indicates",
    "is in accordance with": "matches",
    "on a daily basis": "daily",
    "in a timely manner": "promptly",
    "at all times": "always",
    "PowerStore": "₪1",
    "PowerFlex": "₪2",
    "PowerScale": "₪3",
    "PowerEdge": "₪4",
    "PowerVault": "₪5",
    "PowerConnect": "₪6",
    "PowerMax": "₪7",
    "PowerProtect": "₪8",
    "EqualLogic": "₪9",
    "Compellent": "₪10",
    "Isilon": "₪11",
    "XtremIO": "₪12",
    "VMAX": "₪13",
    "VxRail": "₪14",
    "Unity": "₪15",
    "VNX": "₪16",
    "NetWorker": "₪17",
    "Avamar": "₪18",
    "CloudIQ": "₪19",
    "APEX": "₪20",
    "DataIQ": "₪21",
    "OpenManage": "₪22",
    "OneFS": "₪23",
    "SyncIQ": "₪24",
    "SRDF": "₪25",
    "TimeFinder": "₪26",
    "RecoverPoint": "₪27",
    "Wyse": "₪28",
    "OptiPlex": "₪29",
    "Latitude": "₪30",
    "Inspiron": "₪31",
    "Alienware": "₪32",
    "XPS": "₪33",
    "ProSupport": "₪34",
    "ProDeploy": "₪35",
    "DataDomain": "₪36",
    "ScaleIO": "₪37",
    "VPLEX": "₪38",
    "ViPR": "₪39",
    "ECS": "₪40",
    "CloudLink": "₪41",
    "SecureWorks": "₪42",
    "Precision": "₪43",
    "vxBlock": "₪44",
    "VxRack": "₪45"
}

@router.get("/security/mappings", response_model=SecurityMappingResponse)
async def get_security_mappings():
    """Get security and term substitution mappings."""
    return SecurityMappingResponse(mappings=SECURITY_MAPPINGS)


# ------------------------------------------------------------------
# User Management Endpoints
# ------------------------------------------------------------------

@router.post("/users/register", response_model=UserResponse)
async def register_user(body: UserRegisterRequest, request: Request):
    """Register a new user."""
    cache_handler = request.app.state.cache_handler
    try:
        # Use DB handler to upsert user
        user_data = cache_handler.upsert_user(
            employee_id=body.employee_id, 
            full_name=body.full_name, 
            project_name=body.project_name
        )
        
        return UserResponse(
            employee_id=user_data["employee_id"],
            full_name=user_data["full_name"],
            project_name=user_data["project_name"],
            registered_at=user_data["registered_at"]
        )
    except Exception as e:
        logger.error("Register user error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{employee_id}", response_model=UserResponse)
async def get_user(employee_id: str, request: Request):
    """Get user details."""
    cache_handler = request.app.state.cache_handler
    try:
        user_data = cache_handler.get_user(employee_id)
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")
            
        return UserResponse(
            employee_id=user_data["employee_id"],
            full_name=user_data["full_name"],
            project_name=user_data["project_name"],
            registered_at=user_data["registered_at"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Get user error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users", response_model=list[UserResponse])
async def list_users(limit: int = 100, offset: int = 0, request: Request = None):
    """List all registered users."""
    # Note: request is default-None to avoid injection error if not provided in call signature, 
    # but FastAPI injects it.
    cache_handler = request.app.state.cache_handler
    try:
        users = cache_handler.list_users(limit, offset)
        results = []
        for u in users:
            results.append(UserResponse(
                employee_id=u["employee_id"],
                full_name=u["full_name"],
                project_name=u["project_name"],
                registered_at=u["registered_at"]
            ))
        return results
    except Exception as e:
        logger.error("List users error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
# ------------------------------------------------------------------
# Prompt History Endpoints
# ------------------------------------------------------------------

@router.post("/prompts/activity", response_model=PromptActivityResponse)
async def record_prompt_activity(body: PromptActivityRequest, request: Request):
    """Record prompt usage activity."""
    cache_handler = request.app.state.cache_handler
    try:
        activity_id = cache_handler.record_prompt_activity(
            employee_id=body.employee_id,
            project_id=body.project_id,
            query_text=body.query_text,
            cached=body.cached,
            rating=body.rating,
            rating_reason=body.rating_reason
        )
        
        # We need to return the full response. 
        # Ideally, record_prompt_activity should return the full object or we fetch it.
        # For efficiency, we construct it here since we know what we sent.
        # But we need the timestamp generated by the handler for perfect accuracy.
        # Let's trust the handler's timestamp or fetch it back if critical. 
        # For now, we'll re-use current time close enough or fetch from DB.
        
        # Let's fetch it back to be "perfect"
        # Not efficient but safer for verification.
        # Actually, `get_prompt_history` returns list.
        # Let's just return what we have with a fresh timestamp.
        
        from datetime import datetime, timezone
        return PromptActivityResponse(
            id=activity_id,
            employee_id=body.employee_id,
            project_id=body.project_id,
            query_text=body.query_text,
            timestamp=datetime.now(timezone.utc).isoformat(),
            cached=body.cached,
            rating=body.rating,
            rating_reason=body.rating_reason
        )
    except Exception as e:
        logger.error("Record activity error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prompts/history", response_model=list[PromptActivityResponse])
async def get_prompt_history(employee_id: str, request: Request, limit: int = 100):
    """Get prompt history for a user."""
    cache_handler = request.app.state.cache_handler
    try:
        history_data = cache_handler.get_prompt_history(employee_id, limit)
        results = []
        for item in history_data:
            results.append(PromptActivityResponse(
                id=item["id"],
                employee_id=item["employee_id"],
                project_id=item["project_id"],
                query_text=item["query_text"],
                timestamp=item["timestamp"],
                cached=item["cached"],
                rating=item["rating"],
                rating_reason=item["rating_reason"]
            ))
        return results
    except Exception as e:
        logger.error("Get history error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
