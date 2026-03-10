"""
Ponto de entrada da aplicação FastAPI.
Bootstrap, middleware e routers.
"""
import base64
import binascii
import hmac
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.responses import RedirectResponse

from .ws import session_manager
from .logger import get_logger
from .sounds.registry import get_registry
from .config import AUDIO_DEBUG_DETAILS, WEB_AUTH_PASSWORD, WEB_AUTH_USERNAME

from .api import health, sessions, logs, websocket, audio, diario_proxy

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


def _is_protected_shamy_path(path: str) -> bool:
    """Define se a rota deve exigir autenticação para o diário (/shamy)."""
    return path == "/shamy" or path.startswith("/shamy/")


def _is_authorized(request: Request) -> bool:
    """Valida credenciais HTTP Basic enviadas no header Authorization."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Basic "):
        return False

    encoded_credentials = auth_header[6:].strip()
    try:
        decoded = base64.b64decode(encoded_credentials).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return False

    username, separator, password = decoded.partition(":")
    if not separator:
        return False

    return hmac.compare_digest(username, WEB_AUTH_USERNAME) and hmac.compare_digest(password, WEB_AUTH_PASSWORD)


@app.middleware("http")
async def basic_auth_middleware(request: Request, call_next):
    """Exige autenticação HTTP Basic apenas nas rotas do diário (/shamy)."""
    if not WEB_AUTH_PASSWORD or not _is_protected_shamy_path(request.url.path):
        return await call_next(request)

    if _is_authorized(request):
        return await call_next(request)

    return Response(
        content="Unauthorized",
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="Mud Client"'},
    )

# Arquivos estáticos
app.mount("/static", StaticFiles(directory="static"), name="static")

# Diário opcional: se a pasta existir no deploy, expõe em /shamy/
SHAMY_DIR = Path("static/shamy")
if SHAMY_DIR.is_dir():
    app.mount("/shamy", StaticFiles(directory=str(SHAMY_DIR), html=True), name="shamy")


@app.get("/")
def index():
    return FileResponse("static/index.html")


@app.get("/shamy")
def shamy_redirect():
    return RedirectResponse(url="/shamy/", status_code=301)


# Inclui routers de domínio
app.include_router(health.router)
app.include_router(sessions.router)
app.include_router(logs.router)
app.include_router(websocket.router)
app.include_router(audio.router)
app.include_router(diario_proxy.router)
