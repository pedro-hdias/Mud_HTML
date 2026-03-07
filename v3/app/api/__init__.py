"""
Módulo de routers da API.
Contém utilitários compartilhados entre os routers.
"""
from fastapi import Request
from ..config import DEBUG_API_SECRET


def check_debug_auth(request: Request) -> bool:
    """Verifica autorização para endpoints de debug.
    Se DEBUG_API_SECRET estiver vazio, permite acesso (dev mode)."""
    if not DEBUG_API_SECRET:
        return True
    return request.headers.get("X-Debug-Secret") == DEBUG_API_SECRET
