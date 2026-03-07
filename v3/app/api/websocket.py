"""
API de WebSocket — rota principal de comunicação com o cliente MUD.
"""
from fastapi import APIRouter, WebSocket
from ..ws import websocket_endpoint
from ..config import WS_CLOSE_CODES
from ..logger import get_logger

logger = get_logger("api.websocket")
router = APIRouter()


@router.websocket("/ws")
async def websocket_route(websocket: WebSocket):
    """Rota WebSocket principal; delega ao handler em ws.py."""
    try:
        await websocket_endpoint(websocket)
    except Exception as e:
        logger.exception(f"WebSocket error during handshake: {e}")
        try:
            await websocket.close(code=WS_CLOSE_CODES["internal_error"], reason="Internal server error")
        except Exception:
            pass
