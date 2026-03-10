"""
Proxy para o backend Flask do Diário (shamy).
Roteia requests de /api/ para http://backend:5000/api/
"""
import httpx
from fastapi import APIRouter, Request
from ..logger import get_logger

logger = get_logger("diario_proxy")

router = APIRouter()

BACKEND_URL = "http://backend:5000"


@router.get("/api/read")
async def proxy_get_read():
    """Proxy GET para /api/read do backend Flask"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{BACKEND_URL}/api/read", timeout=10.0)
            return response.json()
    except Exception as e:
        logger.error(f"Erro ao fazer proxy GET /api/read: {e}")
        return {"error": "Failed to fetch from backend"}, 500


@router.post("/api/read")
async def proxy_post_read(request: Request):
    """Proxy POST para /api/read do backend Flask"""
    try:
        body = await request.json()
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BACKEND_URL}/api/read",
                json=body,
                timeout=10.0
            )
            return response.json()
    except Exception as e:
        logger.error(f"Erro ao fazer proxy POST /api/read: {e}")
        return {"error": "Failed to post to backend"}, 500
