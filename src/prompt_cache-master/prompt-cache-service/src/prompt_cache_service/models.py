from __future__ import annotations
"""Pydantic models for API request/response payloads."""
from pydantic import BaseModel
from typing import Optional


class CacheLookupRequest(BaseModel):
    """Request model for cache lookup endpoint."""
    project_id: str
    user_id: str
    prompt: str


class CacheLookupResult(BaseModel):
    """Single cache lookup result with full metadata."""
    key: str  # queryText
    value: str  # llmResponse
    score: float  # similarity score
    
    # Compression metrics (for data parity)
    compressed_prompt: str
    compression_ratio: int
    original_tokens: int
    compressed_tokens: int
    
    # Metadata
    hit_count: int
    created_at: str
    last_accessed: str
    employee_id: str


class CacheLookupResponse(BaseModel):
    """Response model for cache lookup."""
    found: bool
    results: list[CacheLookupResult]


class DataInsertionRequest(BaseModel):
    """Request model for cache insertion endpoint."""
    project_id: str
    user_id: str
    prompt: str
    response: str
    
    # Compression data (required for full parity with IndexedDB)
    compressed_prompt: str
    compression_ratio: int
    original_tokens: int
    compressed_tokens: int


class StoredEntry(BaseModel):
    """Simple stored entry response."""
    key: str
    value: str


class DataInsertionResponse(BaseModel):
    """Response model for cache insertion."""
    stored_entries: list[StoredEntry]


class LLMCompletionRequest(BaseModel):
    """Request model for LLM completion endpoint."""
    prompt: str
    system_prompt: str = ""


class LLMCompletionResponse(BaseModel):
    """Response model for LLM completion."""
    response: str
    provider: str  # "dell", "gemini", or "mock"

