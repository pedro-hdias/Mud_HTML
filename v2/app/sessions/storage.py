"""
Interface abstrata para armazenamento de sessões
Permite futuramente trocar memória por banco de dados sem mudar o código
"""
from abc import ABC, abstractmethod
from typing import Dict, Optional, List
from datetime import datetime


class SessionStorage(ABC):
    """Interface para armazenamento de sessões"""
    
    @abstractmethod
    def get_session(self, session_id: str) -> Optional[Dict]:
        """Recupera dados de uma sessão"""
        pass
    
    @abstractmethod
    def save_session(self, session_id: str, data: Dict):
        """Salva dados de uma sessão"""
        pass
    
    @abstractmethod
    def delete_session(self, session_id: str):
        """Remove uma sessão"""
        pass
    
    @abstractmethod
    def list_sessions(self) -> List[str]:
        """Lista todos os session_ids ativos"""
        pass
    
    @abstractmethod
    def update_last_activity(self, session_id: str, timestamp: datetime):
        """Atualiza o timestamp da última atividade"""
        pass


class MemorySessionStorage(SessionStorage):
    """Implementação em memória (para começar)"""
    
    def __init__(self):
        self._sessions: Dict[str, Dict] = {}
    
    def get_session(self, session_id: str) -> Optional[Dict]:
        return self._sessions.get(session_id)
    
    def save_session(self, session_id: str, data: Dict):
        self._sessions[session_id] = data
    
    def delete_session(self, session_id: str):
        if session_id in self._sessions:
            del self._sessions[session_id]
    
    def list_sessions(self) -> List[str]:
        return list(self._sessions.keys())
    
    def update_last_activity(self, session_id: str, timestamp: datetime):
        if session_id in self._sessions:
            self._sessions[session_id]["last_activity"] = timestamp
