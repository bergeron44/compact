import logging

from fastapi import APIRouter, Request

from .models import (
    CacheLookupRequest,
    CacheLookupResponse,
    CacheLookupResult,
    DataInsertionRequest,
    DataInsertionResponse,
    StoredEntry,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.post("/cache/lookup", response_model=CacheLookupResponse)
async def cache_lookup(body: CacheLookupRequest, request: Request):
    logger.info("Lookup request: project_id=%s, user_id=%s", body.project_id, body.user_id)

    embedding_provider = request.app.state.embedding_provider
    cache_store = request.app.state.cache_store

    embedding = await embedding_provider.embed(body.prompt)
    raw_results = cache_store.lookup(body.project_id, embedding)

    results = [CacheLookupResult(**r) for r in raw_results]
    found = len(results) > 0

    logger.info(
        "Lookup response: project_id=%s, user_id=%s, found=%s, count=%d",
        body.project_id,
        body.user_id,
        found,
        len(results),
    )
    return CacheLookupResponse(found=found, results=results)


@router.post("/cache/insert", response_model=DataInsertionResponse)
async def cache_insert(body: DataInsertionRequest, request: Request):
    logger.info("Insert request: project_id=%s, user_id=%s", body.project_id, body.user_id)

    extraction_model = request.app.state.extraction_model
    embedding_provider = request.app.state.embedding_provider
    cache_store = request.app.state.cache_store

    entries = await extraction_model.extract(body.prompt, body.response)

    if not entries:
        logger.info("No entries extracted: project_id=%s, user_id=%s", body.project_id, body.user_id)
        return DataInsertionResponse(stored_entries=[])

    embeddings = [await embedding_provider.embed(e["key"]) for e in entries]
    cache_store.insert(body.project_id, body.user_id, body.prompt, entries, embeddings)

    stored = [StoredEntry(key=e["key"], value=e["value"]) for e in entries]
    logger.info(
        "Insert response: project_id=%s, user_id=%s, stored=%d",
        body.project_id,
        body.user_id,
        len(stored),
    )
    return DataInsertionResponse(stored_entries=stored)
