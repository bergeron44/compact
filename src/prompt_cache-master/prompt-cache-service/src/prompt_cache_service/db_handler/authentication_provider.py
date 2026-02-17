"""Authentication provider for Dell's AIA Gateway."""
import logging
import base64
import os
from typing import Optional

logger = logging.getLogger(__name__)


class AuthenticationProvider:
    """Provides authentication credentials for Dell GenAI Gateway.
    
    Generates Basic Auth credentials from Client ID and Secret for
    Teams plan users.
    """
    
    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None
    ):
        """Initialize authentication provider.
        
        Args:
            client_id: Dell GenAI client ID (or read from DELL_CLIENT_ID env var)
            client_secret: Dell GenAI client secret (or read from DELL_CLIENT_SECRET env var)
            
        Raises:
            ValueError: If credentials are not provided and not in environment
        """
        self.client_id = client_id or os.getenv("DELL_CLIENT_ID")
        self.client_secret = client_secret or os.getenv("DELL_CLIENT_SECRET")
        
        if not self.client_id or not self.client_secret:
            raise ValueError(
                "DELL_CLIENT_ID and DELL_CLIENT_SECRET must be provided "
                "either as parameters or environment variables"
            )
    
    def get_basic_credentials(self) -> str:
        """Generate Base64-encoded basic auth credentials.
        
        Returns:
            Base64-encoded string of "client_id:client_secret"
        """
        credentials = f"{self.client_id}:{self.client_secret}"
        encoded = base64.b64encode(credentials.encode('utf-8')).decode('utf-8')
        return encoded
