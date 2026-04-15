"""
MudConnection - Gerencia a conexão TCP com o servidor MUD
"""
import asyncio

from ..config import (
    MUD_HOST,
    MUD_PORT,
    MUD_CONNECTION_TIMEOUT_SECONDS,
)
from ..logger import get_logger

logger = get_logger("mud_connection")


class MudConnection:
    """Gerencia a conexão TCP com o servidor MUD."""

    def __init__(self, session_id: str):
        self._session_id = session_id
        self.reader: asyncio.StreamReader | None = None
        self.writer: asyncio.StreamWriter | None = None

    @property
    def is_connected(self) -> bool:
        """Indica se há uma conexão TCP ativa."""
        return self.writer is not None

    async def connect(self) -> bool:
        """Abre conexão TCP com o servidor MUD."""
        try:
            self.reader, self.writer = await asyncio.wait_for(
                asyncio.open_connection(MUD_HOST, MUD_PORT),
                timeout=MUD_CONNECTION_TIMEOUT_SECONDS,
            )
            logger.info(f"Session {self._session_id}: Conexão TCP estabelecida")
            return True
        except asyncio.TimeoutError:
            logger.error(
                f"Session {self._session_id}: Timeout na conexão após "
                f"{MUD_CONNECTION_TIMEOUT_SECONDS}s"
            )
            self.reader = None
            self.writer = None
            return False
        except Exception as e:
            logger.exception(f"Session {self._session_id}: Falha na conexão: {e}")
            self.reader = None
            self.writer = None
            return False

    async def close(self) -> None:
        """Fecha a conexão TCP."""
        if self.writer:
            try:
                self.writer.close()
                await self.writer.wait_closed()
            except Exception as e:
                logger.exception(f"Session {self._session_id}: Erro ao fechar conexão: {e}")
            self.writer = None
            self.reader = None

    async def send(self, data: bytes) -> None:
        """Envia dados para o servidor MUD."""
        if self.writer:
            try:
                self.writer.write(data)
                await self.writer.drain()
            except Exception as e:
                logger.exception(f"Session {self._session_id}: Erro ao enviar dados: {e}")
                raise
