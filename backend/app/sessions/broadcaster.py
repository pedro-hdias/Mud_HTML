"""
SessionBroadcaster - Gerencia o broadcast de mensagens para clientes WebSocket da sessão
"""
from typing import Set

from fastapi import WebSocket

from ..mud.state import ConnectionState
from ..ws_messages import make_message
from ..logger import get_logger

logger = get_logger("broadcaster")


class SessionBroadcaster:
    """Gerencia o broadcast de mensagens para clientes WebSocket da sessão."""

    def __init__(self, session_id: str):
        self._session_id = session_id
        self._clients: Set[WebSocket] = set()

    def add_client(self, ws: WebSocket) -> None:
        """Adiciona um cliente WebSocket."""
        self._clients.add(ws)

    def remove_client(self, ws: WebSocket) -> None:
        """Remove um cliente WebSocket."""
        self._clients.discard(ws)

    def has_clients(self) -> bool:
        """Verifica se há clientes conectados."""
        return len(self._clients) > 0

    @property
    def clients(self) -> Set[WebSocket]:
        """Conjunto de clientes WebSocket ativos."""
        return self._clients

    async def broadcast_message(self, message: dict) -> None:
        """Envia mensagem para todos os clientes, removendo os desconectados."""
        disconnected: list = []

        for ws in list(self._clients):
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(
                    f"Session {self._session_id}: Falha ao enviar mensagem ao cliente, "
                    f"marcando para remoção: {e}"
                )
                disconnected.append(ws)

        for ws in disconnected:
            self.remove_client(ws)

    async def broadcast_state(self, state: ConnectionState) -> None:
        """Envia notificação de estado para todos os clientes."""
        message = make_message("state", {"value": state.value})
        await self.broadcast_message(message)
