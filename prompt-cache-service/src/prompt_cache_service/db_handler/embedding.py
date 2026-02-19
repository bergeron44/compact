from __future__ import annotations
"""Embedding engine implementations for Dell GenAI Gateway."""
import logging
import os
import uuid
from abc import ABC, abstractmethod
from typing import Optional
import httpx
import certifi
from openai import OpenAI

logger = logging.getLogger(__name__)


class EmbeddingEngine(ABC):
    """Abstract base class for embedding engines."""
    
    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        """Generate embedding vector for the given text.
        
        Args:
            text: Input text to embed
            
        Returns:
            List of floats representing the embedding vector
        """
        ...


class DellGenAIEmbeddingProvider(EmbeddingEngine):
    """Production embedding provider using Dell's AIA Gateway.
    
    Supports multiple Dell GenAI embedding models and handles authentication
    via either SSO (Individual plan) or Client ID/Secret (Teams plan).
    """
    
    AVAILABLE_MODELS = [
        "nomic-embed-text-v1",
        "embeddinggemma-300m",
        "granite-embedding-278m-multilingual"
    ]
    
    def __init__(
        self,
        model_name: str = "granite-embedding-278m-multilingual",
        use_sso: bool = False,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
    ):
        """Initialize Dell GenAI embedding provider.
        
        Args:
            model_name: One of the available Dell GenAI models
            use_sso: If True, use SSO authentication (Individual plan)
            client_id: Client ID for Teams plan authentication
            client_secret: Client secret for Teams plan authentication
            
        Raises:
            ValueError: If model_name is not available or credentials are missing
        """
        if model_name not in self.AVAILABLE_MODELS:
            raise ValueError(
                f"Model {model_name} not available. Choose from: {self.AVAILABLE_MODELS}"
            )
        
        self.model_name = model_name
        self.use_sso = use_sso
        self.base_url = "https://aia.gateway.dell.com/genai/dev/v1"
        
        # Initialize authentication
        if use_sso:
            logger.info("Using Single Sign-On (SSO) for Dell GenAI")
            # Note: SSO requires aia-auth-client package
            try:
                from aia_auth import auth
                auth_token = auth.generate_auth_token()
                default_headers = {
                    "x-correlation-id": str(uuid.uuid4()),
                    "Authorization": f"Bearer {auth_token}",
                    "accept": "*/*",
                    "Content-Type": "application/json"
                }
                http_client = httpx.AsyncClient(verify=certifi.where())
            except ImportError:
                logger.error("aia-auth-client not installed. Install with: pip install aia-auth-client==0.0.8")
                raise
        else:
            if not client_id or not client_secret:
                raise ValueError("client_id and client_secret required when not using SSO")
            
            logger.info("Using Client ID/Secret for Dell GenAI")
            # Import Dell's authentication provider
            from . import authentication_provider
            
            auth_provider = authentication_provider.AuthenticationProvider(
                client_id=client_id,
                client_secret=client_secret
            )
            
            default_headers = {
                "x-correlation-id": str(uuid.uuid4()),
                "Authorization": f"Basic {auth_provider.get_basic_credentials()}",
                "accept": "*/*",
                "Content-Type": "application/json"
            }
            http_client = httpx.AsyncClient(verify=certifi.where())
        
        # Initialize OpenAI client (Dell GenAI is OpenAI-compatible)
        self.client = OpenAI(
            base_url=self.base_url,
            http_client=http_client,
            api_key="",  # Replaced by Authorization header
            default_headers=default_headers
        )
        
        logger.info(f"Initialized Dell GenAI embedding provider with model: {model_name}")
    
    async def embed(self, text: str) -> list[float]:
        """Generate embedding using Dell's GenAI service.
        
        Args:
            text: Input text to embed
            
        Returns:
            Embedding vector as list of floats
            
        Raises:
            Exception: If embedding generation fails
        """
        try:
            # Important: encode input to avoid NaN vectors
            encoded_input = text.encode('utf-8').decode('utf-8')
            
            response = self.client.embeddings.create(
                model=self.model_name,
                input=[encoded_input]
            )
            
            embedding = response.data[0].embedding
            logger.debug(f"Generated embedding of dimension {len(embedding)}")
            return embedding
            
        except Exception as e:
            logger.error(f"Embedding generation failed for model {self.model_name}: {e}")
            raise


class HuggingFaceEmbeddingProvider(EmbeddingEngine):
    """HuggingFace embedding provider using Inference API.
    
    Temporary fallback option using the existing HuggingFace infrastructure.
    This allows testing with real embeddings before Dell credentials are available.
    """
    
    def __init__(
        self,
        model_name: str = "BAAI/bge-small-en-v1.5",
        api_key: Optional[str] = None,
    ):
        """Initialize HuggingFace embedding provider.
        
        Args:
            model_name: HuggingFace model to use for embeddings
            api_key: HuggingFace API key (or read from HUGGINGFACEHUB_API_KEY env var)
        
        Raises:
            ValueError: If API key is not provided
        """
        self.model_name = model_name
        self.api_key = api_key or os.getenv("HUGGINGFACEHUB_API_KEY")
        
        if not self.api_key:
            raise ValueError(
                "HUGGINGFACEHUB_API_KEY must be provided either as parameter "
                "or environment variable"
            )
        
        # Use the router endpoint which is more reliable for serverless inference
        self.api_url = f"https://router.huggingface.co/hf-inference/models/{model_name}"
        logger.info(f"Initialized HuggingFace embedding provider with model: {model_name}")
    
    async def embed(self, text: str) -> list[float]:
        """Generate embedding using HuggingFace Inference API.
        
        Args:
            text: Input text to embed
            
        Returns:
            Embedding vector as list of floats
            
        Raises:
            Exception: If embedding generation fails
        """
        try:
            headers = {"Authorization": f"Bearer {self.api_key}"}
            payload = {"inputs": text}
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.api_url,
                    headers=headers,
                    json=payload,
                    timeout=60.0
                )
                
                if response.status_code != 200:
                    logger.error(f"HuggingFace API error: {response.status_code} - {response.text}")
                    raise Exception(f"HuggingFace API returned status {response.status_code}")
                
                # HuggingFace returns nested list, take first element
                embedding = response.json()
                if isinstance(embedding, list) and len(embedding) > 0:
                    if isinstance(embedding[0], list):
                        embedding = embedding[0]  # Extract first embedding
                
                logger.debug(f"Generated HuggingFace embedding of dimension {len(embedding)}")
                return embedding
                
        except Exception as e:
            logger.error(f"HuggingFace embedding generation failed: {e}")
            raise


class PlaceholderEmbeddingProvider(EmbeddingEngine):
    """Stub for testing. DO NOT USE IN PRODUCTION.
    
    Returns zero vectors of specified dimension.
    """
    
    def __init__(self, dim: int = 384):
        """Initialize placeholder provider.
        
        Args:
            dim: Dimension of the zero vector to return
        """
        self.dim = dim
        logger.warning("Using PlaceholderEmbeddingProvider - FOR TESTING ONLY")
    
    async def embed(self, text: str) -> list[float]:
        """Return zero vector.
        
        Args:
            text: Ignored
            
        Returns:
            Zero vector of dimension self.dim
        """
        return [0.0] * self.dim
