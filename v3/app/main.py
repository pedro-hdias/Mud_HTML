from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from .ws import websocket_endpoint, session_manager
from .logger import get_logger, get_current_log_file_path
from .sounds.registry import get_registry
from .config import DEBUG_API_SECRET, WS_CLOSE_CODES, AUDIO_DEBUG_DETAILS
import os
import asyncio
import aiofiles

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

# Monta arquivos estáticos
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def index():
    return FileResponse("static/index.html")

@app.get("/audio")
def audio_page():
    """Página de teste do engine de áudio"""
    return FileResponse("static/audio.html")

@app.get("/sessions")
def sessions_page(request: Request):
    """Página de debug para visualizar sessões ativas"""
    if not _check_debug_auth(request):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    return FileResponse("static/sessions.html")

def _check_debug_auth(request: Request) -> bool:
    """Verifica se o request tem autorização para acessar endpoints de debug.
    Se DEBUG_API_SECRET estiver vazio, permite acesso (dev mode)."""
    if not DEBUG_API_SECRET:
        return True
    return request.headers.get("X-Debug-Secret") == DEBUG_API_SECRET


@app.get("/api/sessions/status")
def sessions_status(request: Request):
    """Retorna status das sessões ativas (útil para debug)"""
    if not _check_debug_auth(request):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    sessions_info = []
    for session_id, session in session_manager.sessions.items():
        sessions_info.append({
            "session_id": session_id,
            "state": session.state.value,
            "clients_count": len(session.websocket_clients),
            "last_activity": session.last_activity.isoformat(),
            "history_size": len(session.history)
        })
    
    return {
        "total_sessions": session_manager.get_session_count(),
        "total_clients": session_manager.get_active_client_count(),
        "sessions": sessions_info
    }

@app.websocket("/ws")
async def websocket_route(websocket: WebSocket):
    try:
        await websocket_endpoint(websocket)
    except Exception as e:
        logger.exception(f"WebSocket error during handshake: {e}")
        try:
            await websocket.close(code=WS_CLOSE_CODES["internal_error"], reason="Internal server error")
        except:
            pass

# ============================================================================
# HEALTH CHECK
# ============================================================================

@app.get("/health")
def health_check():
    """Health check público — utilizado por Docker HEALTHCHECK e monitores."""
    return {
        "status": "ok",
        "sessions": session_manager.get_session_count(),
        "clients": session_manager.get_active_client_count()
    }

# ============================================================================
# LOG VIEWER - COMPLETAMENTE REMOVÍVEL (remover este bloco quando não precisar)
# ============================================================================

@app.get("/logs")
def logs_page(request: Request):
    """Página para visualizar logs em tempo real"""
    if not _check_debug_auth(request):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    return FileResponse("static/logs.html")

@app.get("/api/logs/stream")
async def logs_stream(request: Request):
    if not _check_debug_auth(request):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    """Stream de logs em tempo real usando Server-Sent Events"""
    async def event_generator():
        log_file = get_current_log_file_path()
        
        # Envia as últimas 50 linhas primeiro
        try:
            if os.path.exists(log_file):
                async with aiofiles.open(log_file, 'r', encoding='utf-8') as f:
                    lines = await f.readlines()
                    # Envia últimas 50 linhas
                    for line in lines[-50:]:
                        yield f"data: {line}\n\n"
        except Exception as e:
            yield f"data: [ERROR] Could not read log file: {e}\n\n"
        
        # Agora faz tail -f (follow mode)
        last_size = os.path.getsize(log_file) if os.path.exists(log_file) else 0
        
        try:
            while True:
                try:
                    if os.path.exists(log_file):
                        current_size = os.path.getsize(log_file)
                        if current_size > last_size:
                            async with aiofiles.open(log_file, 'r', encoding='utf-8') as f:
                                await f.seek(last_size)
                                new_content = await f.read()
                                for line in new_content.splitlines():
                                    if line.strip():
                                        yield f"data: {line}\n\n"
                            last_size = current_size
                        elif current_size < last_size:
                            # Arquivo foi truncado/recriado
                            last_size = 0
                            
                    await asyncio.sleep(0.5)  # Verifica a cada 500ms
                except (asyncio.CancelledError, GeneratorExit):
                    return
                except Exception as e:
                    yield f"data: [ERROR] {e}\n\n"
                    await asyncio.sleep(1)
        except (asyncio.CancelledError, GeneratorExit):
            return
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

# ============================================================================
# FIM DO LOG VIEWER - REMOVER ATÉ AQUI
# ============================================================================
# ============================================================================
# DIAGNÓSTICO DE ÁUDIO
# ============================================================================

@app.get("/api/audio/diagnostic")
async def audio_diagnostic():
    """Retorna diagnóstico completo do sistema de áudio com métricas de performance."""
    from .sounds.engine import PrometheusSoundEngine
    from .sounds.registry import get_registry
    
    try:
        engine = PrometheusSoundEngine()
        registry = get_registry()
        
        # 📊 NOVAS MÉTRICAS: Performance stats
        perf_stats = engine.get_performance_stats()
        
        return {
            "status": "OK",
            "engine": {
                "total_rules": len(engine._rules),
                "cached_matchers": perf_stats["cached_matchers"],
                "cache_coverage": perf_stats["cache_coverage"],
            },
            "registry": {
                **registry.get_stats(),
            },
            "performance": {
                "matcher_cache_coverage": perf_stats["cache_coverage"],
                "last_line": perf_stats["last_line_processed"],
            },
            "diagnostic_report": engine.get_diagnostic_report(),
        }
    except Exception as e:
        logger.exception(f"Erro no diagnóstico de áudio: {e}")
        return {
            "status": "ERROR",
            "error": str(e),
        }


@app.get("/api/audio/performance-metrics")
async def audio_performance_metrics():
    """Retorna métricas detalhadas de performance do motor de áudio."""
    from .sounds.engine import PrometheusSoundEngine
    
    try:
        engine = PrometheusSoundEngine()
        stats = engine.get_performance_stats()
        
        return {
            "status": "OK",
            "metrics": stats,
            "cache_efficiency": {
                "compiled": stats["cached_matchers"],
                "total_rules": stats["total_rules"],
                "coverage_percentage": stats["cache_coverage"],
                "benefit": "Matchers compilados en cache evitan recompilação en cada línea procesada"
            },
            "timestamp": stats["timestamp"],
        }
    except Exception as e:
        logger.exception(f"Erro ao carregar métrcas: {e}")
        return {
            "status": "ERROR",
            "error": str(e),
        }


@app.get("/api/sounds/validate/{sound_path:path}")
async def validate_sound(sound_path: str):
    """Verifica se som existe e retorna caminho normalizado."""
    from .sounds.registry import get_registry
    
    try:
        registry = get_registry()
        normalized = registry.get(sound_path)
        
        return {
            "requested": sound_path,
            "normalized": normalized,
            "valid": normalized is not None,
            "available_similar": registry.find_similar(sound_path, max_results=5) if not normalized else [],
        }
    except Exception as e:
        logger.exception(f"Erro ao validar som: {e}")
        return {
            "requested": sound_path,
            "valid": False,
            "error": str(e),
        }