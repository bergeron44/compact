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
    ) -> CachedPromptEntry | None:
        """Query the store and return the best-matching entry.

        Args:
            project_id: Unique identifier for the project namespace to search.
            query_embedding: The embedding vector to search against.

        Returns:
            The best-matching :class:`CachedPromptEntry`, or ``None`` if no
            namespace exists, the store is empty, or no results are found.
        """
        ...

    async def cache_prompt(
        self,
        project_id: str,
        user_id: str,
        prompt: str,
        answer: str,
    ) -> str | None:
        """Store a prompt/answer pair in the cache and return its unique entry ID.

        Args:
            project_id: Unique identifier for the project namespace to write into.
            user_id: Identifier of the user submitting the prompt.
            prompt: The user prompt text to cache.
            answer: The answer text associated with the prompt.

        Returns:
            The generated ``entry_id`` string on success, or ``None`` on failure.
        """
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
                created_at=now,
                times_accessed=0,
                last_accessed_at=now,
            )
            self._push_entry(entry)
            self._logger.info("Cached prompt: entry_id=%s, project_id=%s", entry.entry_id, project_id)
            return entry.entry_id
        except Exception:
            self._logger.exception("Failed to cache prompt: project_id=%s", project_id)
            return None

    async def lookup_prompt(
        self,
        project_id: str,
        prompt: str,
    ) -> CachedPromptEntry | None:
        """Look up a cached entry by semantic similarity to the given prompt.

        Args:
            project_id: Unique identifier for the project namespace to search.
            prompt: The prompt text to search for.

        Returns:
            The best-matching :class:`CachedPromptEntry`, or ``None`` if no
            sufficiently similar entry is found.
        """
        key_embeddings = await self._embed_engine.embed(prompt)
        entry = self._pull_entry(project_id, key_embeddings)
        if entry is None:
            self._logger.info("Lookup miss: no results, project_id=%s", project_id)
            return None

        self._logger.info("Lookup hit: entry_id=%s, project_id=%s", entry.entry_id, project_id)
        return entry


class ChromaDbHandler(CacheDbHandler[chromadb.Collection]):
    """ChromaDB-backed implementation of :class:`CacheDbHandler`."""

    def __init__(
        self,
        embed_engine: EmbeddingEngine,
        persist_dir: str | None = None,
    ):
        """Initialize the ChromaDB client.

        Args:
            embed_engine: Engine used to convert text into an embedding vector.
            persist_dir: Optional path for a persistent on-disk store. If None,
                         an ephemeral (in-memory) client is used instead.
        """
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
        """Create a new ChromaDB collection for the given project.

        Args:
            project_id: Unique identifier for the project.

        Raises:
            ValueError: If a namespace for ``project_id`` already exists.
        """
        if self._get_project_namespace(project_id) is not None:
            raise ValueError(f"Namespace for project '{project_id}' already exists.")
        name = f"project_{project_id}"
        self.client.create_collection(name=name, metadata={"hnsw:space": "cosine"})
        self._logger.info("Created namespace: %s", name)

    def _get_project_namespace(self, project_id: str) -> chromadb.Collection | None:
        """Return the ChromaDB collection for the project, or None if it does not exist.

        Args:
            project_id: Unique identifier for the project.

        Returns:
            The :class:`chromadb.Collection` for the project, or ``None`` if no
            collection exists.
        """
        try:
            return self.client.get_collection(f"project_{project_id}")
        except Exception:
            return None

    @property
    def project_namespaces(self) -> list[str]:
        """Names of all existing ChromaDB collections (one per project).

        Returns:
            A list of collection name strings.
        """
        return [collection.name for collection in self.client.list_collections()]

    # ------------------------------------------------------------------
    # Internal DB primitives
    # ------------------------------------------------------------------

    def _push_entry(self, entry: CachedPromptEntry) -> None:
        """Persist a :class:`CachedPromptEntry` to its project's ChromaDB collection.

        Args:
            entry: The entry to store. Its ``key_embedding`` is used as the
                   ChromaDB embedding vector; all other fields are serialised
                   into flat metadata.
        """
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
                "created_at": entry.created_at.isoformat(),
                "times_accessed": entry.times_accessed,
                "last_accessed_at": entry.last_accessed_at.isoformat(),
            }],
        )

    def _pull_entry(
        self,
        project_id: str,
        query_embedding: list[float],
    ) -> CachedPromptEntry | None:
        """Query a ChromaDB collection and return the best-matching entry.

        Runs a nearest-neighbour search using ``query_embedding``, reconstructs
        the top result into a :class:`CachedPromptEntry`, and persists the
        updated access counters back to the collection.

        Args:
            project_id: Unique identifier for the project namespace to search.
            query_embedding: The embedding vector to search against.

        Returns:
            The best-matching :class:`CachedPromptEntry`, or ``None`` if no
            namespace exists, the collection is empty, or returns no results.
        """
        collection = self._get_project_namespace(project_id)
        if collection is None:
            self._logger.info("Lookup miss: no namespace for project_id=%s", project_id)
            return None

        if collection.count() == 0:
            return None

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=1,
            include=["embeddings", "documents", "metadatas"],
        )

        ids = results.get("ids", [[]])[0]
        embeddings = results.get("embeddings", [[]])[0]
        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]

        if not ids:
            return None

        meta = metadatas[0]
        entry = CachedPromptEntry(
            entry_id=ids[0],
            project_id=meta["project_id"],
            user_id=meta["user_id"],
            key_embedding=embeddings[0],
            prompt=documents[0],
            answer=meta["answer"],
            created_at=datetime.fromisoformat(meta["created_at"]),
            times_accessed=meta["times_accessed"] + 1,
            last_accessed_at=datetime.now(timezone.utc),
        )

        collection.update(
            ids=[entry.entry_id],
            metadatas=[{
                "project_id": entry.project_id,
                "user_id": entry.user_id,
                "answer": entry.answer,
                "created_at": entry.created_at.isoformat(),
                "times_accessed": entry.times_accessed,
                "last_accessed_at": entry.last_accessed_at.isoformat(),
            }],
        )

        return entry
