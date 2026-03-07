"""
API de gerenciamento de sessões.
"""
from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse
from ..ws import session_manager
from . import check_debug_auth

router = APIRouter()


@router.get("/sessions")
def sessions_page(request: Request):
    """Página de debug para visualizar sessões ativas."""
    if not check_debug_auth(request):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    return FileResponse("static/sessions.html")


@router.get("/api/sessions/status")
def sessions_status(request: Request):
    """Retorna status das sessões ativas (útil para debug)."""
    if not check_debug_auth(request):
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
