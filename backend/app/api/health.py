"""
API de health check.
"""
from fastapi import APIRouter
from ..ws import session_manager

router = APIRouter()


@router.get("/health")
def health_check():
    """Health check público — utilizado por Docker HEALTHCHECK e monitores."""
    return {
        "status": "ok",
        "sessions": session_manager.get_session_count(),
        "clients": session_manager.get_active_client_count()
    }
