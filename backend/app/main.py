"""
Ponto de entrada da aplicação FastAPI.
Bootstrap, middleware e routers.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI

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
    if registry_stats["total_files"] == 0:
        logger.warning(
            f"Nenhum arquivo de áudio encontrado em {registry_stats['sounds_dir']}. "
            "O backend continuará ativo, mas o sistema de sons ficará indisponível."
        )
    if AUDIO_DEBUG_DETAILS:
        logger.info(f"Audio inventory (debug) por categoria: {registry_stats['categories']}")

    await session_manager.start_cleanup_task()
    logger.info("Session cleanup task started")

    yield

    # Shutdown
    await session_manager.stop_cleanup_task()
    logger.info("Session cleanup task stopped")


app = FastAPI(lifespan=lifespan)

# Compatibilidade com proxy que remove o prefixo /mud antes de encaminhar ao app
app.include_router(health.router)
app.include_router(sessions.router)
app.include_router(logs.router)
app.include_router(websocket.router)
app.include_router(audio.router)

# URL pública canônica sob /mud
app.include_router(health.router, prefix="/mud")
app.include_router(sessions.router, prefix="/mud")
app.include_router(logs.router, prefix="/mud")
app.include_router(websocket.router, prefix="/mud")
app.include_router(audio.router, prefix="/mud")
