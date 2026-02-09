from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from .ws import websocket_endpoint, session_manager
from .logger import get_logger, get_current_log_file_path
from .config import DEBUG_MODE
import os
import asyncio
import aiofiles

app = FastAPI()
logger = get_logger("main")

# Monta arquivos estáticos
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.on_event("startup")
async def on_startup():
    logger.debug("Application startup")
    
    # Invalida todas as sessões anteriores
    await session_manager.invalidate_all_sessions()
    logger.info("Previous sessions invalidated")
    
    # Inicia task de limpeza de sessões inativas
    await session_manager.start_cleanup_task()
    logger.info("Session cleanup task started")

@app.on_event("shutdown")
async def on_shutdown():
    logger.debug("Application shutdown")
    # Para task de limpeza
    await session_manager.stop_cleanup_task()
    logger.info("Session cleanup task stopped")

@app.get("/")
def index():
    return FileResponse("static/index.html")

@app.get("/sessions")
def sessions_page():
    """Página de debug para visualizar sessões ativas"""
    if not DEBUG_MODE:
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse("static/sessions.html")

@app.get("/api/sessions/status")
def sessions_status():
    """Retorna status das sessões ativas (útil para debug)"""
    if not DEBUG_MODE:
        raise HTTPException(status_code=404, detail="Not found")
    
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
        logger.debug("WebSocket route invoked")
        await websocket_endpoint(websocket)
    except Exception as e:
        logger.exception(f"WebSocket error during handshake: {e}")
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except:
            pass

# ============================================================================
# LOG VIEWER - COMPLETAMENTE REMOVÍVEL (remover este bloco quando não precisar)
# ============================================================================

@app.get("/logs")
def logs_page():
    """Página para visualizar logs em tempo real"""
    if not DEBUG_MODE:
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse("static/logs.html")

@app.get("/api/logs/stream")
async def logs_stream():
    """Stream de logs em tempo real usando Server-Sent Events"""
    if not DEBUG_MODE:
        raise HTTPException(status_code=404, detail="Not found")
    
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
            except Exception as e:
                yield f"data: [ERROR] {e}\n\n"
                await asyncio.sleep(1)
    
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
