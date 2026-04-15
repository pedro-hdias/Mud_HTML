"""
MudSession - Coordenador de sessão individual de conexão ao MUD.
Delega responsabilidades para subcomponentes especializados.
"""
import asyncio
import secrets
from datetime import datetime
from typing import Set

from fastapi import WebSocket

from ..mud.state import ConnectionState, log_state_change
from ..mud.menu_detector import MenuDetector
from ..config import (
    HISTORY_MAX_BYTES,
    HISTORY_MAX_LINES,
)
from ..logger import get_logger
from ..sounds import get_sound_engine
from .history import SessionHistory
from .broadcaster import SessionBroadcaster
from .mud_connection import MudConnection
from .mud_reader import MudReader

logger = get_logger("session")


class MudSession:
    """Coordenador de sessão individual — delega para subcomponentes especializados."""

    def __init__(self, public_id: str):
        self.public_id = public_id          # ID público da sessão
        self.owner_token = secrets.token_urlsafe(32)  # Prova de propriedade (secreto)
        self.partial_buffer: str = ""
        self.reader_task: asyncio.Task = None
        self.state = ConnectionState.DISCONNECTED
        self.last_activity = datetime.now()
        self.manual_disconnect = False       # Flag para desconexão intencional
        self.sound_engine = get_sound_engine()
        self.menu_detector = MenuDetector()

        # Subcomponentes
        self._history = SessionHistory(
            max_bytes=HISTORY_MAX_BYTES,
            max_lines=HISTORY_MAX_LINES,
        )
        self._broadcaster = SessionBroadcaster(public_id)
        self._connection = MudConnection(public_id)
        self._reader = MudReader(self)

        logger.info(f"Session created: {public_id} (owner: {self.owner_token[:8]}...)")

    # ------------------------------------------------------------------
    # Propriedades de retrocompatibilidade
    # ------------------------------------------------------------------

    @property
    def history(self) -> str:
        """Conteúdo atual do histórico."""
        return self._history._content

    @history.setter
    def history(self, value: str) -> None:
        """Define o conteúdo do histórico diretamente."""
        self._history._content = value

    @property
    def websocket_clients(self) -> Set[WebSocket]:
        """Conjunto de clientes WebSocket ativos (retrocompatibilidade)."""
        return self._broadcaster.clients

    @property
    def reader(self):
        """StreamReader da conexão TCP."""
        return self._connection.reader

    @property
    def writer(self):
        """StreamWriter da conexão TCP."""
        return self._connection.writer

    # ------------------------------------------------------------------
    # Métodos de ciclo de vida
    # ------------------------------------------------------------------

    def touch(self) -> None:
        """Atualiza o timestamp da última atividade."""
        self.last_activity = datetime.now()

    # ------------------------------------------------------------------
    # Gestão de clientes WebSocket (delega ao broadcaster)
    # ------------------------------------------------------------------

    def add_websocket(self, ws: WebSocket) -> None:
        """Adiciona um cliente WebSocket a esta sessão."""
        self._broadcaster.add_client(ws)
        self.touch()

    def remove_websocket(self, ws: WebSocket) -> None:
        """Remove um cliente WebSocket desta sessão."""
        self._broadcaster.remove_client(ws)

    def has_clients(self) -> bool:
        """Verifica se a sessão tem clientes conectados."""
        return self._broadcaster.has_clients()

    # ------------------------------------------------------------------
    # Histórico (delega ao SessionHistory)
    # ------------------------------------------------------------------

    def get_recent_history(self, num_lines: int = 25) -> str:
        """Retorna as últimas N linhas do histórico."""
        return self._history.get_recent(num_lines)

    def get_history_slice(self, from_line_index: int, num_lines: int = 25) -> dict:
        """
        Retorna um slice de histórico anterior ao from_line_index.
        Usado para lazy loading de histórico antigo.
        """
        return self._history.get_slice(from_line_index, num_lines)

    def _append_history(self, text: str) -> None:
        """
        Adiciona texto ao histórico com trimming automático.
        Opera diretamente nos atributos do histórico para que os patches de
        HISTORY_MAX_BYTES e HISTORY_MAX_LINES em app.sessions.session funcionem.
        """
        if not text:
            return

        self._history._content += text

        if HISTORY_MAX_BYTES and len(self._history._content) > HISTORY_MAX_BYTES:
            self._history._content = self._history._content[-HISTORY_MAX_BYTES:]

        if HISTORY_MAX_LINES:
            lines = self._history._content.splitlines(keepends=True)
            if len(lines) > HISTORY_MAX_LINES:
                self._history._content = "".join(lines[-HISTORY_MAX_LINES:])

    # ------------------------------------------------------------------
    # Broadcast (delega ao SessionBroadcaster)
    # ------------------------------------------------------------------

    async def broadcast_state(self, state: ConnectionState) -> None:
        """Notifica todos os clientes desta sessão sobre mudança de estado."""
        previous_state = self.state
        self.state = state
        log_state_change(previous_state, state, f"session_{self.public_id}")
        await self._broadcaster.broadcast_state(state)

    async def broadcast_message(self, message: dict) -> None:
        """Envia mensagem para todos os clientes desta sessão."""
        await self._broadcaster.broadcast_message(message)

    # ------------------------------------------------------------------
    # Conexão TCP com o MUD (delega ao MudConnection)
    # ------------------------------------------------------------------

    async def connect_to_mud(self) -> bool:
        """Abre conexão TCP com o servidor MUD."""
        connected = await self._connection.connect()
        if connected:
            self.touch()
        return connected

    async def close_mud_connection(self) -> None:
        """Fecha a conexão TCP com o MUD."""
        await self._connection.close()

    async def send_to_mud(self, data: bytes) -> None:
        """Envia dados para o servidor MUD."""
        await self._connection.send(data)
        self.touch()

    # ------------------------------------------------------------------
    # Desconexão e limpeza
    # ------------------------------------------------------------------

    async def disconnect_from_mud(self) -> None:
        """Desconecta do MUD e limpa recursos (preserva histórico para reconexão)."""
        # Cancela a task de leitura se existir
        if self.reader_task and not self.reader_task.done():
            self.reader_task.cancel()
            try:
                await self.reader_task
            except asyncio.CancelledError:
                pass

        await self.close_mud_connection()

        self.reader_task = None
        # Não limpa self.history — preserva para reconexão.
        # O histórico só é apagado em clear_session() quando a sessão é removida.
        self.partial_buffer = ""

        await self.broadcast_state(ConnectionState.DISCONNECTED)

    def clear_session(self) -> None:
        """Limpa todos os dados da sessão (usado pelo manager ao remover)."""
        self._history.clear()
        self.partial_buffer = ""

    # ------------------------------------------------------------------
    # Loop de leitura (delega ao MudReader)
    # ------------------------------------------------------------------

    async def mud_reader(self) -> None:
        """Task assíncrona que lê dados do MUD continuamente."""
        await self._reader.run()