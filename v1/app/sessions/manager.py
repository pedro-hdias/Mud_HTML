"""
SessionManager - Gerencia múltiplas sessões MUD
Responsável por criar, recuperar e limpar sessões
"""
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Optional

from .session import MudSession
from .storage import SessionStorage, MemorySessionStorage
from ..logger import get_logger

logger = get_logger("session_manager")


class SessionManager:
    """Gerenciador de sessões MUD"""
    
    def __init__(self, storage: Optional[SessionStorage] = None, session_timeout_minutes: int = 10):
        self.storage = storage or MemorySessionStorage()
        self.sessions: Dict[str, MudSession] = {}
        self.session_timeout = timedelta(minutes=session_timeout_minutes)
        self.cleanup_task: asyncio.Task = None
        
        logger.info(f"SessionManager initialized (timeout: {session_timeout_minutes} min)")
    
    def get_or_create_session(self, session_id: str) -> MudSession:
        """Obtém uma sessão existente ou cria uma nova"""
        if session_id not in self.sessions:
            logger.info(f"Creating new session: {session_id}")
            session = MudSession(session_id)
            self.sessions[session_id] = session
            
            # Salva metadados no storage (para persistência futura)
            self.storage.save_session(session_id, {
                "session_id": session_id,
                "created_at": datetime.now(),
                "last_activity": datetime.now(),
                "state": session.state.value
            })
        else:
            logger.debug(f"Retrieving existing session: {session_id}")
        
        session = self.sessions[session_id]
        session.touch()
        self.storage.update_last_activity(session_id, datetime.now())
        
        return session
    
    async def remove_session(self, session_id: str):
        """Remove uma sessão e limpa recursos"""
        if session_id in self.sessions:
            session = self.sessions[session_id]
            logger.info(f"Removing session: {session_id}")
            
            # Desconecta do MUD se conectado
            if session.state != session.state.DISCONNECTED:
                await session.disconnect_from_mud()
            
            # Remove do storage
            self.storage.delete_session(session_id)
            
            # Remove do dicionário
            del self.sessions[session_id]
    
    async def cleanup_inactive_sessions(self):
        """Remove sessões inativas (sem clientes e com timeout expirado)"""
        now = datetime.now()
        sessions_to_remove = []
        
        for session_id, session in list(self.sessions.items()):
            # Verifica se sessão não tem clientes
            if not session.has_clients():
                # Verifica se passou do timeout
                inactive_time = now - session.last_activity
                if inactive_time > self.session_timeout:
                    logger.info(f"Session {session_id} inactive for {inactive_time}, marking for cleanup")
                    sessions_to_remove.append(session_id)
        
        # Remove sessões marcadas
        for session_id in sessions_to_remove:
            await self.remove_session(session_id)
        
        if sessions_to_remove:
            logger.info(f"Cleaned up {len(sessions_to_remove)} inactive sessions")
    
    async def start_cleanup_task(self):
        """Inicia task de limpeza periódica (roda a cada 1 minuto)"""
        if self.cleanup_task is None or self.cleanup_task.done():
            self.cleanup_task = asyncio.create_task(self._cleanup_loop())
            logger.info("Cleanup task started")
    
    async def stop_cleanup_task(self):
        """Para a task de limpeza"""
        if self.cleanup_task and not self.cleanup_task.done():
            self.cleanup_task.cancel()
            try:
                await self.cleanup_task
            except asyncio.CancelledError:
                logger.info("Cleanup task stopped")
    
    async def _cleanup_loop(self):
        """Loop de limpeza periódica"""
        while True:
            try:
                await asyncio.sleep(60)  # Verifica a cada 1 minuto
                await self.cleanup_inactive_sessions()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception(f"Error in cleanup loop: {e}")
    
    def get_session_count(self) -> int:
        """Retorna número de sessões ativas"""
        return len(self.sessions)
    
    def get_active_client_count(self) -> int:
        """Retorna número total de clientes WebSocket conectados"""
        return sum(len(session.websocket_clients) for session in self.sessions.values())
