from pydantic import BaseModel


class CacheLookupRequest(BaseModel):
    project_id: str
    user_id: str
    prompt: str


class CacheLookupResult(BaseModel):
    key: str
    value: str
    score: float


class CacheLookupResponse(BaseModel):
    found: bool
    results: list[CacheLookupResult]


class DataInsertionRequest(BaseModel):
    project_id: str
    user_id: str
    prompt: str
    response: str


class StoredEntry(BaseModel):
    key: str
    value: str


class DataInsertionResponse(BaseModel):
    stored_entries: list[StoredEntry]
