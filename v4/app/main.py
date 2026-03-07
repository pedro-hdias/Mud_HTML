"""
Ponto de entrada da aplicação FastAPI.
Bootstrap, middleware e routers.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .ws import session_manager
from .logger import get_logger
from .sounds.registry import get_registry
from .config import AUDIO_DEBUG_DETAILS

from .api import health, sessions, logs, websocket, audio

logger = get_logger("main")


@asynccontextmanager
async def lifespan(app):
    # Startup
    await session_manager.invalidate_all_sessions()
    logger.info("Previous sessions invalidated")

    registry = get_registry(force_refresh=True)
    registry_stats = registry.get_stats()
    logger.info(f"Audio inventory loaded: {registry_stats['total_files']} arquivos de áudio encontrados")
    if AUDIO_DEBUG_DETAILS:
        logger.info(f"Audio inventory (debug) por categoria: {registry_stats['categories']}")

    await session_manager.start_cleanup_task()
    logger.info("Session cleanup task started")

    yield

    # Shutdown
    await session_manager.stop_cleanup_task()
    logger.info("Session cleanup task stopped")


app = FastAPI(lifespan=lifespan)

# Arquivos estáticos
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def index():
    return FileResponse("static/index.html")


# Inclui routers de domínio
app.include_router(health.router)
app.include_router(sessions.router)
app.include_router(logs.router)
app.include_router(websocket.router)
app.include_router(audio.router)
