from __future__ import annotations
"""Pydantic models for API request/response payloads."""
from pydantic import BaseModel
from typing import Optional, Dict


class CacheLookupRequest(BaseModel):
    """Request model for cache lookup endpoint."""
    project_id: str
    user_id: str
    prompt: str
    limit: int = 1
    threshold: float = 0.0


class CacheStatsResponse(BaseModel):
    """Response model for cache statistics."""
    project_id: str
    total_entries: int
    total_hits: int
    avg_compression: float


class CacheDeleteRequest(BaseModel):
    """Request model for deleting cache entries."""
    project_id: str
    entry_ids: list[str]


class CacheClearRequest(BaseModel):
    """Request model for clearing project cache."""
    project_id: str


class CacheHitRequest(BaseModel):
    """Request model for recording a cache hit."""
    project_id: str
    entry_id: str


class VoteRequest(BaseModel):
    """Request model for voting on a cache entry."""
    project_id: str
    entry_id: str
    vote_type: str  # "like" or "dislike"


class CacheLookupResult(BaseModel):
    """Single cache lookup result with full metadata."""
    entry_id: str
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
    likes: int = 0
    dislikes: int = 0
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
    provider: Optional[str] = None  # e.g., "dell", "gemini", "mock", "free"


class LLMCompletionResponse(BaseModel):
    """Response model for LLM completion."""
    response: str
    provider: str  # "dell", "gemini", or "mock"


class UserRegisterRequest(BaseModel):
    """Request model for registering a user."""
    employee_id: str
    full_name: str
    project_name: str


class UserResponse(BaseModel):
    """Response model for user details."""
    employee_id: str
    full_name: str
    project_name: str
    registered_at: str


class PromptActivityRequest(BaseModel):
    """Request model for recording prompt usage."""
    employee_id: str
    project_id: str
    query_text: str
    cached: bool
    rating: Optional[int] = None
    rating_reason: Optional[str] = None


class PromptActivityResponse(BaseModel):
    """Response model for a stored prompt activity."""
    id: str
    employee_id: str
    project_id: str
    query_text: str
    timestamp: str
    cached: bool
    rating: Optional[int] = None
    rating_reason: Optional[str] = None


class SecurityMappingResponse(BaseModel):
    """Response model for security mappings."""
    mappings: Dict[str, str]

