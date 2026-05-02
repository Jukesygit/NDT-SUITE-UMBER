"""
Per-session authentication for the NDT Companion API.

Generates a startup token included in /status for webapp bootstrap.
Additional tokens via POST /auth/session. Tokens stored in memory only —
lost on restart by design (forces re-auth, which takes one /status call).

Rate-limited to MAX_TOKENS concurrent tokens. Expired tokens purged on
every creation attempt.
"""

import logging
import secrets
import threading
import time
from typing import Optional

logger = logging.getLogger(__name__)

TOKEN_TTL_SECONDS = 86400  # 24 hours
MAX_TOKENS = 10

_lock = threading.Lock()
_tokens: dict[str, float] = {}
_startup_token: Optional[str] = None


def generate_startup_token() -> str:
    """Generate a token at startup. Returned in /status for webapp bootstrap."""
    global _startup_token
    token = secrets.token_hex(32)
    with _lock:
        _purge_expired()
        _tokens[token] = time.time()
        _startup_token = token
    logger.info("Startup auth token generated")
    return token


def create_session_token() -> tuple[Optional[str], Optional[str]]:
    """Create a new session token.

    Returns (token, None) on success or (None, error_message) on failure.
    """
    with _lock:
        _purge_expired()
        if len(_tokens) >= MAX_TOKENS:
            return None, f"Too many active tokens ({MAX_TOKENS}). Try again later."
        token = secrets.token_hex(32)
        _tokens[token] = time.time()
    logger.info("Session token created (%d active)", len(_tokens))
    return token, None


def validate_token(token: str) -> bool:
    """Check if a token is valid and not expired."""
    with _lock:
        ts = _tokens.get(token)
        if ts is None:
            return False
        if time.time() - ts > TOKEN_TTL_SECONDS:
            del _tokens[token]
            return False
        return True


def get_startup_token() -> Optional[str]:
    """Return the startup token (for inclusion in /status)."""
    return _startup_token


def _purge_expired() -> None:
    """Remove expired tokens. Must be called with _lock held."""
    now = time.time()
    expired = [t for t, ts in _tokens.items() if now - ts > TOKEN_TTL_SECONDS]
    for t in expired:
        del _tokens[t]
    if expired:
        logger.info("Purged %d expired tokens", len(expired))
