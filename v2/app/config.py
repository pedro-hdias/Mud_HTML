import os

MUD_HOST = "prometheus-enterprises.com"
MUD_PORT = 2223

# Sessões
SESSION_TIMEOUT_MINUTES = 10
SESSION_REMOVAL_DELAY_SECONDS = 30
SESSION_CLEANUP_INTERVAL_SECONDS = 60
MAX_SESSIONS = int(os.environ.get("MAX_SESSIONS", 50))

# MUD IO
MUD_READ_BUFFER_SIZE = 4096
MUD_IDLE_SLEEP_SECONDS = 0.05
MUD_QUIT_GRACE_SECONDS = 0.5

# Rate limiting (WebSocket)
WS_RATE_LIMIT_MAX_MESSAGES = int(os.environ.get("WS_RATE_LIMIT_MAX_MESSAGES", 15))
WS_RATE_LIMIT_WINDOW_SECONDS = float(os.environ.get("WS_RATE_LIMIT_WINDOW_SECONDS", 1.0))

# Histórico (limites)
HISTORY_MAX_BYTES = 2 * 1024 * 1024
HISTORY_MAX_LINES = 4000

# Debug endpoints (secret header para proteger /api/sessions/status e /api/logs/stream)
# Definir via variável de ambiente em produção. Vazio = sem proteção (dev mode).
DEBUG_API_SECRET = os.environ.get("DEBUG_API_SECRET", "")
