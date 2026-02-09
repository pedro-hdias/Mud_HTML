import os

MUD_HOST = "prometheus-enterprises.com"
MUD_PORT = 2223

# Debug mode configuration
# Set DEBUG=true in environment to enable debug endpoints
DEBUG_MODE = os.getenv("DEBUG", "false").lower() in ("true", "1", "yes")
