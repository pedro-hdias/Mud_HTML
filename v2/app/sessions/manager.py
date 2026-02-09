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
    
    def get_or_create_session(self, public_id: str, owner_token: str = None) -> tuple[MudSession, str, bool]:
        """Obtém uma sessão existente (validando owner) ou cria uma nova
        
        Args:
            public_id: ID público da sessão
            owner_token: Prova de propriedade (token secreto)
        
        Returns:
            tuple[MudSession, str, bool]: (session, status, is_valid)
            - session: A sessão (None se inválida)
            - status: "created" | "recovered" | "invalid_owner" | "manual_disconnect"
            - is_valid: True se pode usar a sessão, False se deve rejeitar
        """
        if public_id in self.sessions:
            session = self.sessions[public_id]
            
            # Verifica se foi desconectada manualmente (não permite reconexão)
            if session.manual_disconnect:
                logger.warning(f"⛔ Session {public_id} was manually disconnected - rejecting reconnect")
                return (None, "manual_disconnect", False)
            
            # Valida owner token
            if owner_token and owner_token != session.owner_token:
                logger.warning(f"🚨 SECURITY: Invalid owner token for session {public_id}")
                return (None, "invalid_owner", False)
            
            # Sessão válida e recuperada
            logger.info(f"✅ Session RECOVERED: {public_id}")
            session.touch()
            self.storage.update_last_activity(public_id, datetime.now())
            return (session, "recovered", True)
        
        # Cria nova sessão
        logger.info(f"🆕 Creating NEW session: {public_id}")
        session = MudSession(public_id)
        self.sessions[public_id] = session
        
        # Salva metadados no storage (para persistência futura)
        self.storage.save_session(public_id, {
            "public_id": public_id,
            "created_at": datetime.now(),
            "last_activity": datetime.now(),
            "state": session.state.value,
            "owner_token": session.owner_token
        })
        
        return (session, "created", True)
    
    async def remove_session(self, public_id: str):
        """Remove uma sessão e limpa recursos"""
        if public_id in self.sessions:
            session = self.sessions[public_id]
            logger.info(f"Removing session: {public_id}")
            
            # Desconecta do MUD se conectado
            if session.state != session.state.DISCONNECTED:
                await session.disconnect_from_mud()
            
            # Remove do storage
            self.storage.delete_session(public_id)
            
            # Remove do dicionário
            del self.sessions[public_id]
    
    async def cleanup_inactive_sessions(self):
        """Remove sessões inativas (sem clientes e com timeout expirado)"""
        now = datetime.now()
        sessions_to_remove = []
        
        for public_id, session in list(self.sessions.items()):
            # Verifica se sessão não tem clientes
            if not session.has_clients():
                # Verifica se passou do timeout
                inactive_time = now - session.last_activity
                if inactive_time > self.session_timeout:
                    logger.info(f"Session {public_id} inactive for {inactive_time}, marking for cleanup")
                    sessions_to_remove.append(public_id)
        
        # Remove sessões marcadas
        for public_id in sessions_to_remove:
            await self.remove_session(public_id)
        
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
    
    async def schedule_session_removal(self, public_id: str, delay_seconds: int = 30):
        """Agenda remoção de uma sessão após um delay (usado em desconexão manual)"""
        logger.info(f"Scheduling removal of session {public_id} in {delay_seconds}s")
        await asyncio.sleep(delay_seconds)
        
        if public_id in self.sessions:
            await self.remove_session(public_id)
            logger.info(f"Session {public_id} removed after manual disconnect")
    
    async def invalidate_all_sessions(self):
        """Invalida e remove todas as sessões existentes"""
        logger.info(f"Invalidating all sessions (total: {len(self.sessions)})")
        
        # Desconecta todas as sessões do MUD
        for public_id, session in list(self.sessions.items()):
            try:
                if session.state != session.state.DISCONNECTED:
                    await session.disconnect_from_mud()
            except Exception as e:
                logger.exception(f"Error disconnecting session {public_id}: {e}")
        
        # Limpa o storage
        for public_id in self.storage.list_sessions():
            try:
                self.storage.delete_session(public_id)
            except Exception as e:
                logger.exception(f"Error deleting session {public_id} from storage: {e}")
        
        # Limpa o dicionário de sessões
        self.sessions.clear()
        
        logger.info("All sessions invalidated")

