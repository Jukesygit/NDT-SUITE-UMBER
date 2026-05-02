"""
FastAPI server for Matrix NDT Companion app.

Provides a localhost API for the NDT Suite webapp to discover the companion app,
query indexed NDE files, export C-scans, and render B-scan/A-scan images.
"""

import logging
import socket

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .auth import generate_startup_token, validate_token
from .cache import FileCache
from .routes import create_router

logger = logging.getLogger(__name__)

PORT_RANGE_START = 18923
PORT_RANGE_END = 18932

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
    "http://localhost:4173",
    "https://matrixportal.io",
]

AUTH_EXEMPT_PATHS = {"/status", "/auth/session", "/docs", "/openapi.json"}


def create_app(cache: FileCache, config: dict) -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(title="Matrix NDT Companion", version="1.0.0")

    generate_startup_token()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[
            "X-Matrix-Width", "X-Matrix-Height", "X-Matrix-Dtype",
            "X-Has-Amplitude",
            "X-Has-Envelope", "X-Envelope-Samples",
            "X-Time-Start-Us", "X-Time-End-Us", "X-Velocity",
            "X-Stats", "X-Source-Files", "X-Warnings",
            "X-Scan-Line-Mm", "X-Index-Line-Mm", "X-Render-Ms",
            "X-Cache-Version",
            "X-Content-Hash",
        ],
    )

    app.state.cache = cache

    @app.middleware("http")
    async def auth_and_cache_version(request: Request, call_next):
        # Auth check — validate Bearer token when present, allow if absent (backward compat)
        if request.url.path not in AUTH_EXEMPT_PATHS:
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
                if not validate_token(token):
                    from fastapi.responses import JSONResponse
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Invalid or expired token"},
                    )

        response = await call_next(request)
        response.headers["X-Cache-Version"] = str(cache.get_snapshot().version)
        return response

    router = create_router(cache)
    app.include_router(router)

    return app


def find_available_port() -> int:
    """Find an available port in the companion app range."""
    for port in range(PORT_RANGE_START, PORT_RANGE_END + 1):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    logger.warning("No port available in range %d-%d, using OS-assigned", PORT_RANGE_START, PORT_RANGE_END)
    return 0


def start_server(cache: FileCache, config: dict) -> None:
    """Start the FastAPI server. Runs uvicorn in the current thread (blocking).

    The caller should run this in a daemon thread.
    """
    port = find_available_port()
    if port == 0:
        port = PORT_RANGE_START

    config["port"] = port
    app = create_app(cache, config)

    logger.info("Starting Matrix NDT Companion API on port %d", port)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
