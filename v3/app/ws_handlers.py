"""
ws_handlers.py - Handlers de mensagens WebSocket
Extraído de ws.py para melhor separação de responsabilidades
"""
import asyncio
from fastapi import WebSocket

from .mud.state import ConnectionState, log_state_read
from .sessions.session import MudSession
from .ws_messages import make_message
from .config import MUD_QUIT_GRACE_SECONDS, SESSION_REMOVAL_DELAY_SECONDS
from .logger import get_logger

logger = get_logger("ws_handlers")


async def handle_connect(session: MudSession, ws: WebSocket, public_id: str, session_manager) -> None:
    """Processa pedido de conexão ao MUD"""
    log_state_read(session.state, f"connect_request_{public_id}")
    if session.state == ConnectionState.DISCONNECTED:
        await session.broadcast_state(ConnectionState.CONNECTING)
        if await session.connect_to_mud():
            await session.broadcast_state(ConnectionState.CONNECTED)
            session.reader_task = asyncio.create_task(session.mud_reader())
        else:
            await session.broadcast_state(ConnectionState.DISCONNECTED)
            logger.debug(f"Session {public_id}: MUD connection failed")
            await ws.send_json(make_message("system", {"message": "Falha ao conectar no servidor"}))


async def handle_disconnect(session: MudSession, ws: WebSocket, public_id: str, session_manager) -> None:
    """Processa pedido de desconexão do MUD"""
    log_state_read(session.state, f"disconnect_request_{public_id}")
    if session.state != ConnectionState.DISCONNECTED and session.writer:
        # Marca como desconexão manual (invalida sessão)
        session.manual_disconnect = True
        logger.info(f"Session {public_id}: Marked as manual disconnect")

        # Envia comando quit
        try:
            logger.debug(f"Session {public_id}: Sending quit to MUD")
            await session.send_to_mud(b"quit\n")
        except Exception:
            logger.exception(f"Session {public_id}: Failed to send quit to MUD")
        # Aguarda um momento para o servidor processar
        await asyncio.sleep(MUD_QUIT_GRACE_SECONDS)
        await session.disconnect_from_mud()

        # Agenda remoção da sessão
        asyncio.create_task(
            session_manager.schedule_session_removal(public_id, delay_seconds=SESSION_REMOVAL_DELAY_SECONDS)
        )


async def handle_login(session: MudSession, ws: WebSocket, public_id: str, payload: dict) -> None:
    """Processa credenciais de login"""
    log_state_read(session.state, f"login_request_{public_id}")
    if session.writer and session.state in [ConnectionState.CONNECTED, ConnectionState.AWAITING_LOGIN]:
        username: str = payload.get("username", "")
        password: str = payload.get("password", "")

        # Envia sequência de login
        try:
            logger.debug(f"Session {public_id}: Sending login sequence to MUD")
            await session.send_to_mud(b"p\n")
            await asyncio.sleep(0.1)
            await session.send_to_mud((username + "\n").encode())
            await asyncio.sleep(0.1)
            await session.send_to_mud((password + "\n").encode())
        except Exception as e:
            logger.exception(f"Session {public_id}: Error sending login: {e}")


async def handle_command(session: MudSession, ws: WebSocket, public_id: str, payload: dict) -> None:
    """Processa comando normal do jogador"""
    log_state_read(session.state, f"command_request_{public_id}")
    if session.writer and session.state == ConnectionState.CONNECTED:
        command: str = payload.get("value", "")

        # Validação de tamanho (evitar buffer overflow no servidor MUD)
        if len(command) > 512:
            logger.warning(f"Session {public_id}: Command too long ({len(command)} chars), truncated")
            command = command[:512]

        logger.debug(f"Session {public_id}: Sending command to MUD")
        await session.send_to_mud((command + "\n").encode())


async def handle_raw_command(session: MudSession, public_id: str, raw_msg: str) -> None:
    """Processa comando bruto (backward compatibility)"""
    log_state_read(session.state, f"raw_command_{public_id}")
    if session.writer and session.state == ConnectionState.CONNECTED:
        logger.debug(f"Session {public_id}: Sending raw command to MUD")
        await session.send_to_mud((raw_msg + "\n").encode())
