from __future__ import annotations
import logging
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Generic, TypeVar
from prompt_cache_service.db_handler.embedding import EmbeddingEngine

import chromadb


@dataclass
class CachedPromptEntry:
    """A single cached prompt/answer pair stored in the cache database.

    Attributes:
        entry_id: Unique identifier for this entry.
        project_id: Project this entry belongs to.
        user_id: User who submitted the original prompt.
        key_embedding: Vector embedding of the key, used for similarity lookups.
        prompt: The original user prompt.
        answer: The answer associated with the prompt.
        created_at: UTC datetime when the entry was first stored.
        times_accessed: Number of times this entry has been returned in a lookup.
        last_accessed_at: UTC datetime of the most recent lookup hit.
    """

    entry_id: str
    project_id: str
    user_id: str
    key_embedding: list[float]
    prompt: str
    answer: str
    created_at: datetime
    times_accessed: int
    last_accessed_at: datetime
    compressed_prompt: str = ""
    compression_ratio: float = 0.0
    original_tokens: int = 0
    compressed_tokens: int = 0
    score: float = 1.0
    likes: int = 0
    dislikes: int = 0


NS = TypeVar("NS")


class CacheDbHandler(ABC, Generic[NS]):
    """Abstract base class defining the API for a generic cache database handler.

    The type parameter ``NS`` is the namespace object type used by the concrete
    implementation (e.g. ``chromadb.Collection`` for :class:`ChromaDbHandler`).
    """

    def __init__(self, embed_engine: EmbeddingEngine):
        """Initialize the handler with an embedding engine.

        Args:
            embed_engine: Engine used to convert text into an embedding vector.
        """
        self._embed_engine = embed_engine
        self._logger = logging.getLogger(f"{__name__}.{type(self).__name__}")

    @abstractmethod
    def create_project_namespace(self, project_id: str) -> None:
        """Create a new namespace for the given project.

        Args:
            project_id: Unique identifier for the project.

        Raises:
            ValueError: If a namespace for ``project_id`` already exists.
        """
        ...

    @abstractmethod
    def _get_project_namespace(self, project_id: str) -> NS | None:
        """Return the namespace object for the given project, or None if absent.

        Args:
            project_id: Unique identifier for the project.

        Returns:
            The namespace object (type depends on the implementation), or
            ``None`` if no namespace exists for ``project_id``.
        """
        ...

    @property
    @abstractmethod
    def project_namespaces(self) -> list[str]:
        """All currently existing project namespace identifiers.

        Returns:
            A list of namespace identifier strings, one per registered project.
            Returns an empty list when no namespaces have been created.
        """
        ...

    @abstractmethod
    def _push_entry(self, entry: CachedPromptEntry) -> None:
        """Persist a :class:`CachedPromptEntry` to the underlying store.

        Args:
            entry: The entry to store.

        Raises:
            ValueError: If no namespace exists for the entry's project.
        """
        ...

    @abstractmethod
    def _pull_entry(
        self,
        project_id: str,
        query_embedding: list[float],
        limit: int = 1,
        threshold: float = 0.0,
    ) -> list[CachedPromptEntry]:
        """Query the store and return matching entries.

        Args:
            project_id: Unique identifier for the project namespace to search.
            query_embedding: The embedding vector to search against.
            limit: Maximum number of results to return.
            threshold: Minimum similarity score (0-1) to include in results.

        Returns:
            A list of matching :class:`CachedPromptEntry` objects.
        """
        ...

    @abstractmethod
    def get_project_stats(self, project_id: str) -> dict:
        """Get usage statistics for the project.

        Returns:
            Dictionary with 'total_entries', 'total_hits', etc.
        """
        ...
    
    @abstractmethod
    def list_entries(self, project_id: str, limit: int = 100, offset: int = 0) -> list[CachedPromptEntry]:
        """List entries for a project, sorted by most recently accessed."""
        ...

    @abstractmethod
    def delete_entries(self, project_id: str, entry_ids: list[str]) -> int:
        """Delete specific entries from the cache."""
        ...

    @abstractmethod
    def clear_project_cache(self, project_id: str) -> int:
        """Delete all entries for a project."""
        ...

    @abstractmethod
    def increment_entry_hit(self, project_id: str, entry_id: str) -> bool:
        """Increment the hit count for a specific entry."""
        ...

    @abstractmethod
    def vote_entry(self, project_id: str, entry_id: str, vote_type: str) -> tuple[int, int]:
        """Vote on an entry (like/dislike). Returns (likes, dislikes)."""
        ...

    async def cache_prompt(
        self,
        project_id: str,
        user_id: str,
        prompt: str,
        answer: str,
        compressed_prompt: str = "",
        compression_ratio: float = 0.0,
        original_tokens: int = 0,
        compressed_tokens: int = 0,
    ) -> str | None:
        """Store a prompt/answer pair in the cache and return its unique entry ID."""
        try:
            now = datetime.now(timezone.utc)
            key_embedding = await self._embed_engine.embed(prompt)
            entry = CachedPromptEntry(
                entry_id=str(uuid.uuid4()),
                project_id=project_id,
                user_id=user_id,
                key_embedding=key_embedding,
                prompt=prompt,
                answer=answer,
                compressed_prompt=compressed_prompt,
                compression_ratio=compression_ratio,
                original_tokens=original_tokens,
                compressed_tokens=compressed_tokens,
                created_at=now,
                times_accessed=1,
                last_accessed_at=now,
                likes=0,
                dislikes=0,
            )
            self._push_entry(entry)
            self._logger.info("Cached prompt: entry_id=%s, project_id=%s", entry.entry_id, project_id)
            return entry.entry_id
        except Exception as e:
            self._logger.exception("Failed to cache prompt: project_id=%s", project_id)
            raise e  # Propagate error to router for debugging

    async def lookup_prompt(
        self,
        project_id: str,
        prompt: str,
        limit: int = 1,
        threshold: float = 0.8,
    ) -> list[CachedPromptEntry]:
        """Look up cached entries by semantic similarity with hybrid ranking."""
        key_embeddings = await self._embed_engine.embed(prompt)
        
        # 1. Fetch more candidates than requested to allow re-ranking
        # Fetch 3x limit to get a good candidate pool
        candidates = self._pull_entry(project_id, key_embeddings, limit=limit * 3, threshold=threshold)
        
        if not candidates:
            self._logger.info("Lookup miss: no results, project_id=%s", project_id)
            return []

        # 2. Hybrid Ranking Logic
        # effective_score = similarity + boost
        # boost = max(-0.1, min(0.2, (likes - dislikes) * 0.01))
        # This means 10 net likes = +0.1 similarity. Cap at +0.2.
        
        ranked_candidates = []
        for entry in candidates:
            net_votes = entry.likes - entry.dislikes
            # Cap boost between -0.1 and +0.2
            vote_boost = max(-0.1, min(0.2, net_votes * 0.01))
            hybrid_score = entry.score + vote_boost
            
            # Use a tuple for sorting: (hybrid_score, original_score)
            ranked_candidates.append((hybrid_score, entry))
        
        # Sort descending by hybrid score
        ranked_candidates.sort(key=lambda x: x[0], reverse=True)
        
        # Take top `limit`
        final_entries = [x[1] for x in ranked_candidates[:limit]]

        self._logger.info("Lookup hit: found %d matches (from %d candidates), project_id=%s", 
                          len(final_entries), len(candidates), project_id)
        return final_entries


class ChromaDbHandler(CacheDbHandler[chromadb.Collection]):
    """ChromaDB-backed implementation of :class:`CacheDbHandler`."""

    def __init__(
        self,
        embed_engine: EmbeddingEngine,
        persist_dir: str | None = None,
    ):
        super().__init__(embed_engine)
        if persist_dir:
            self.client = chromadb.PersistentClient(path=persist_dir)
        else:
            self.client = chromadb.EphemeralClient()
        self._logger.info("ChromaDbHandler initialized (persist_dir=%s)", persist_dir)

    # ------------------------------------------------------------------
    # Namespace management
    # ------------------------------------------------------------------

    def create_project_namespace(self, project_id: str) -> None:
        if self._get_project_namespace(project_id) is not None:
            raise ValueError(f"Namespace for project '{project_id}' already exists.")
        name = f"project_{project_id}"
        self.client.create_collection(name=name, metadata={"hnsw:space": "cosine"})
        self._logger.info("Created namespace: %s", name)

    def _get_project_namespace(self, project_id: str) -> chromadb.Collection | None:
        try:
            return self.client.get_collection(f"project_{project_id}")
        except Exception:
            return None

    @property
    def project_namespaces(self) -> list[str]:
        return [collection.name for collection in self.client.list_collections()]

    # ------------------------------------------------------------------
    # Internal DB primitives
    # ------------------------------------------------------------------

    def _push_entry(self, entry: CachedPromptEntry) -> None:
        collection = self._get_project_namespace(entry.project_id)
        if collection is None:
            raise ValueError(f"No namespace found for project '{entry.project_id}'.")
        collection.add(
            ids=[entry.entry_id],
            embeddings=[entry.key_embedding],
            documents=[entry.prompt],
            metadatas=[{
                "project_id": entry.project_id,
                "user_id": entry.user_id,
                "answer": entry.answer,
                "compressed_prompt": entry.compressed_prompt,
                "compression_ratio": entry.compression_ratio,
                "original_tokens": entry.original_tokens,
                "compressed_tokens": entry.compressed_tokens,
                "created_at": entry.created_at.isoformat(),
                "times_accessed": entry.times_accessed,
                "last_accessed_at": entry.last_accessed_at.isoformat(),
                "likes": entry.likes,
                "dislikes": entry.dislikes,
            }],
        )

    def _pull_entry(
        self,
        project_id: str,
        query_embedding: list[float],
        limit: int = 1,
        threshold: float = 0.0,
    ) -> list[CachedPromptEntry]:
        collection = self._get_project_namespace(project_id)
        if collection is None:
            return []

        if collection.count() == 0:
            return []

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=limit,
            include=["embeddings", "documents", "metadatas", "distances"],
        )

        ids = results.get("ids", [[]])[0]
        embeddings = results.get("embeddings", [[]])[0]
        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        if ids is None or len(ids) == 0:
            return []

        entries = []
        updates_ids = []
        updates_metas = []
        
        for i, entry_id in enumerate(ids):
            # cosine distance = 1 - similarity. So similarity = 1 - distance
            similarity = 1.0 - distances[i] if (distances is not None and len(distances) > 0) else 0.0
            if similarity < threshold:

                continue

            meta = metadatas[i]
            
            # Handle missing fields gracefully
            entry = CachedPromptEntry(
                entry_id=entry_id,
                project_id=meta.get("project_id", project_id),
                user_id=meta.get("user_id", "unknown"),
                key_embedding=embeddings[i] if (embeddings is not None and len(embeddings) > i) else [],
                prompt=documents[i],
                answer=meta.get("answer", ""),
                compressed_prompt=meta.get("compressed_prompt", ""),
                compression_ratio=meta.get("compression_ratio", 0.0),
                original_tokens=meta.get("original_tokens", 0),
                compressed_tokens=meta.get("compressed_tokens", 0),
                created_at=datetime.fromisoformat(meta.get("created_at", datetime.now(timezone.utc).isoformat())),
                times_accessed=meta.get("times_accessed", 0),
                last_accessed_at=datetime.fromisoformat(meta.get("last_accessed_at", datetime.now(timezone.utc).isoformat())),
                likes=meta.get("likes", 0),
                dislikes=meta.get("dislikes", 0),
                score=similarity
            )
            entries.append(entry)
            
        return entries

        return entries

    def get_project_stats(self, project_id: str) -> dict:
        collection = self._get_project_namespace(project_id)
        if collection is None:
            return {"total_entries": 0, "total_hits": 0}
        
        # Calculate stats by iterating over all metadata (Chroma doesn't support aggregation yet)
        try:
            # allow fetching all ID/metadata for stats
            res = collection.get(include=["metadatas"])
            metas = res.get("metadatas", [])
            
            total_hits = 0
            total_compression = 0.0
            count = len(metas)
            
            for m in metas:
                total_hits += m.get("times_accessed", 0)
                total_compression += m.get("compression_ratio", 0.0)
                
            avg_compression = (total_compression / count) if count > 0 else 0.0
            
            return {
                "total_entries": count,
                "total_hits": total_hits,
                "avg_compression": round(avg_compression, 1)
            }
        except Exception:
             return {
                "total_entries": count,
                "total_hits": 0,
                "avg_compression": 0
            }

    def list_entries(self, project_id: str, limit: int = 100, offset: int = 0) -> list[CachedPromptEntry]:
        collection = self._get_project_namespace(project_id)
        if collection is None:
            return []
            
        # Chroma's get(limit, offset) returns entries
        # Default order is insertion compatible? No, strictly random/id based usually.
        # We can't easily sort by date without fetching all.
        res = collection.get(
            limit=limit,
            offset=offset,
            include=["embeddings", "documents", "metadatas"]
        )
        
        ids = res['ids']
        embeddings = res.get('embeddings')
        document_list = res.get('documents')
        if document_list is None: 
            document_list = []
        metadatas = res['metadatas']
        
        entries = []
        for i, eid in enumerate(ids):
            meta = metadatas[i]
            emb = embeddings[i] if (embeddings is not None and len(embeddings) > i) else []
            entry = CachedPromptEntry(
                entry_id=eid,
                project_id=meta.get("project_id", project_id),
                user_id=meta.get("user_id", "unknown"),
                key_embedding=emb, 
                prompt=document_list[i] if i < len(document_list) else "",
                answer=meta.get("answer", ""),
                compressed_prompt=meta.get("compressed_prompt", ""),
                compression_ratio=meta.get("compression_ratio", 0.0),
                original_tokens=meta.get("original_tokens", 0),
                compressed_tokens=meta.get("compressed_tokens", 0),
                created_at=datetime.fromisoformat(meta.get("created_at", datetime.now(timezone.utc).isoformat())),
                times_accessed=meta.get("times_accessed", 0),
                last_accessed_at=datetime.fromisoformat(meta.get("last_accessed_at", datetime.now(timezone.utc).isoformat())),
                likes=meta.get("likes", 0),
                dislikes=meta.get("dislikes", 0),
            )
            entries.append(entry)
        
        # Sort by last_accessed_at descending (client side sorting for this page)
        entries.sort(key=lambda x: x.last_accessed_at, reverse=True)
        return entries

    def delete_entries(self, project_id: str, entry_ids: list[str]) -> int:
        collection = self._get_project_namespace(project_id)
        if collection is None:
            return 0
        
        collection.delete(ids=entry_ids)
        return len(entry_ids)

    def clear_project_cache(self, project_id: str) -> int:
        collection = self._get_project_namespace(project_id)
        if collection is None:
            return 0
        count = collection.count()
        self.client.delete_collection(f"project_{project_id}")
        return count

    # ------------------------------------------------------------------
    # User Management
    # ------------------------------------------------------------------

    def get_user(self, employee_id: str) -> dict | None:
        try:
            collection = self.client.get_collection("users")
            res = collection.get(ids=[employee_id], include=["metadatas"])
            if not res["ids"]:
                return None
            return res["metadatas"][0]
        except Exception:
            return None

    @abstractmethod
    def list_users(self, limit: int = 100, offset: int = 0) -> list[dict]:
        """List all users."""
        ...

    def upsert_user(self, employee_id: str, full_name: str, project_name: str) -> dict:
        collection = self.client.get_or_create_collection("users")
        now = datetime.now(timezone.utc).isoformat()
        
        existing = self.get_user(employee_id)
        registered_at = existing.get("registered_at", now) if existing else now

        collection.upsert(
            ids=[employee_id],
            documents=[full_name], 
            metadatas=[{
                "employee_id": employee_id,
                "full_name": full_name,
                "project_name": project_name,
                "registered_at": registered_at
            }]
        )
        return {
            "employee_id": employee_id,
            "full_name": full_name,
            "project_name": project_name,
            "registered_at": registered_at
        }

    def list_users(self, limit: int = 100, offset: int = 0) -> list[dict]:
        try:
            collection = self.client.get_collection("users")
            res = collection.get(
                limit=limit,
                offset=offset,
                include=["metadatas"]
            )
            users = []
            if res["ids"]:
                for meta in res["metadatas"]:
                    users.append(meta)
            # Sort by registered_at desc
            users.sort(key=lambda x: x.get("registered_at", ""), reverse=True)
            return users
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Prompt History
    # ------------------------------------------------------------------

    def record_prompt_activity(
        self, 
        employee_id: str, 
        project_id: str, 
        query_text: str, 
        cached: bool,
        rating: int | None = None,
        rating_reason: str | None = None
    ) -> str:
        collection = self.client.get_or_create_collection("prompt_history")
        activity_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        
        meta = {
            "employee_id": employee_id,
            "project_id": project_id,
            "timestamp": now,
            "cached": "True" if cached else "False", 
            "rating": rating if rating is not None else -1,
            "rating_reason": rating_reason or ""
        }
        
        collection.add(
            ids=[activity_id],
            documents=[query_text],
            metadatas=[meta]
        )
        return activity_id

    def get_prompt_history(self, employee_id: str, limit: int = 100) -> list[dict]:
        try:
            collection = self.client.get_collection("prompt_history")
            res = collection.get(
                where={"employee_id": employee_id},
                limit=limit,
                include=["documents", "metadatas"]
            )
            
            history = []
            if res["ids"]:
                for i, aid in enumerate(res["ids"]):
                    meta = res["metadatas"][i]
                    history.append({
                        "id": aid,
                        "query_text": res["documents"][i],
                        "employee_id": meta["employee_id"],
                        "project_id": meta["project_id"],
                        "timestamp": meta["timestamp"],
                        "cached": meta["cached"] == "True",
                        "rating": meta["rating"] if meta["rating"] != -1 else None,
                        "rating_reason": meta["rating_reason"]
                    })
            
            history.sort(key=lambda x: x["timestamp"], reverse=True)
            return history
        except Exception:
            return []

    def increment_entry_hit(self, project_id: str, entry_id: str) -> bool:
        """Increment hit count for a specific entry."""
        collection = self._get_project_namespace(project_id)
        if collection is None:
            return False
            
        try:
            res = collection.get(ids=[entry_id], include=["metadatas"])
            if not res["ids"]:
                return False
                
            meta = res["metadatas"][0]
            current_hits = meta.get("times_accessed", 0)
            
            # Update metadata
            meta["times_accessed"] = current_hits + 1
            meta["last_accessed_at"] = datetime.now(timezone.utc).isoformat()
            
            collection.update(
                ids=[entry_id],
                metadatas=[meta]
            )
            return True
        except Exception as e:
            self._logger.error("Failed to increment hit for %s: %s", entry_id, e)
            return False
    def vote_entry(self, project_id: str, entry_id: str, vote_type: str) -> tuple[int, int]:
        """Vote on an entry. Returns (new_likes, new_dislikes)."""
        collection = self._get_project_namespace(project_id)
        if collection is None:
            return 0, 0
            
        try:
            res = collection.get(ids=[entry_id], include=["metadatas"])
            if not res["ids"]:
                return 0, 0
                
            meta = res["metadatas"][0]
            current_likes = meta.get("likes", 0)
            current_dislikes = meta.get("dislikes", 0)
            
            if vote_type == "like":
                current_likes += 1
            elif vote_type == "dislike":
                current_dislikes += 1
            # else: unknown vote type, do nothing
            
            # Update metadata
            meta["likes"] = current_likes
            meta["dislikes"] = current_dislikes
            
            collection.update(
                ids=[entry_id],
                metadatas=[meta]
            )
            return current_likes, current_dislikes
        except Exception as e:
            self._logger.error("Failed to vote for %s: %s", entry_id, e)
            return 0, 0
