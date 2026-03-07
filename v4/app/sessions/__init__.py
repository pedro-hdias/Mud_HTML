"""
Módulo de gerenciamento de sessões
Cada sessão representa uma conexão independente ao MUD
"""
from .session import MudSession
from .manager import SessionManager

__all__ = ["MudSession", "SessionManager"]
