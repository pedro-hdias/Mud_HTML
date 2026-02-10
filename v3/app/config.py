import os
from typing import Dict, Final

MUD_HOST: Final[str] = "prometheus-enterprises.com"
MUD_PORT: Final[int] = 2223

# Sessões
SESSION_TIMEOUT_MINUTES: Final[int] = 10
SESSION_REMOVAL_DELAY_SECONDS: Final[int] = 30
SESSION_CLEANUP_INTERVAL_SECONDS: Final[int] = 60
MAX_SESSIONS: Final[int] = int(os.environ.get("MAX_SESSIONS", 50))

# MUD IO
MUD_READ_BUFFER_SIZE: Final[int] = 4096
MUD_IDLE_SLEEP_SECONDS: Final[float] = 0.05
MUD_QUIT_GRACE_SECONDS: Final[float] = 0.5
MUD_PARTIAL_BUFFER_MAX_BYTES: Final[int] = 65536  # 64KB - flush forçado se exceder

# Rate limiting (WebSocket)
WS_RATE_LIMIT_MAX_MESSAGES: Final[int] = int(os.environ.get("WS_RATE_LIMIT_MAX_MESSAGES", 15))
WS_RATE_LIMIT_WINDOW_SECONDS: Final[float] = float(os.environ.get("WS_RATE_LIMIT_WINDOW_SECONDS", 1.0))

# Histórico (limites)
HISTORY_MAX_BYTES: Final[int] = 2 * 1024 * 1024
HISTORY_MAX_LINES: Final[int] = 4000

# Debug endpoints (secret header para proteger /api/sessions/status e /api/logs/stream)
# Definir via variável de ambiente em produção. Vazio = sem proteção (dev mode).
DEBUG_API_SECRET: Final[str] = os.environ.get("DEBUG_API_SECRET", "")

# Códigos de fechamento WebSocket (reutilizáveis em ws.py e ws_handlers.py)
WS_CLOSE_CODES: Final[Dict[str, int]] = {
    "session_invalid": 4003,
    "max_sessions": 4008,
    "internal_error": 1011,
}
