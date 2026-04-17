"""
ws_handlers.py - Handlers de mensagens WebSocket
Extraído de ws.py para melhor separação de responsabilidades
"""
import asyncio
from fastapi import WebSocket

from .mud import parser
from .mud.state import ConnectionState, log_state_read
from .sessions.session import MudSession
from .ws_messages import make_message
from .config import MUD_QUIT_GRACE_SECONDS, SESSION_REMOVAL_DELAY_SECONDS
from .logger import get_logger

logger = get_logger("ws_handlers")


async def handle_connect(session: MudSession, ws: WebSocket, public_id: str, session_manager) -> None:
    """Handles request to connect to MUD"""
    log_state_read(session.state, f"connect_request_{public_id}")
    if session.state == ConnectionState.DISCONNECTED:
        await session.broadcast_state(ConnectionState.CONNECTING)
        if await session.connect_to_mud():
            await session.broadcast_state(ConnectionState.CONNECTED)
            session.reader_task = asyncio.create_task(session.mud_reader())
        else:
            await session.broadcast_state(ConnectionState.DISCONNECTED)
            await ws.send_json(make_message("system", {"message": "Failed to connect to server"}))


async def handle_disconnect(session: MudSession, ws: WebSocket, public_id: str, session_manager) -> None:
    """Handles request to disconnect from MUD"""
    log_state_read(session.state, f"disconnect_request_{public_id}")
    if session.state != ConnectionState.DISCONNECTED and session.writer:
        # Marca como desconexão manual (invalida sessão)
        session.manual_disconnect = True
        logger.info(f"Session {public_id}: Marked as manual disconnect")

        # Envia comando quit
        try:
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
    """Processes login credentials."""
    log_state_read(session.state, f"login_request_{public_id}")
    if session.writer and session.state in [ConnectionState.CONNECTED, ConnectionState.AWAITING_LOGIN]:
        username = payload.get("username", "")
        password = payload.get("password", "")

        if not isinstance(username, str) or not isinstance(password, str):
            logger.warning(f"Session {public_id}: Invalid login payload types")
            return

        session.pending_username = username
        session.pending_password = password

        try:
            if getattr(session, "awaiting_login_choice", False):
                await session.send_to_mud(b"p\n")
                logger.info(f"Session {public_id}: opção de login existente enviada, aguardando prompt de username")
            else:
                await session.send_to_mud((username + "\n").encode())
                session.pending_username = None
                logger.info(f"Session {public_id}: usuário enviado, aguardando prompt para liberar a senha")
        except Exception as e:
            session.pending_username = None
            session.pending_password = None
            logger.exception(f"Session {public_id}: Error sending login: {e}")


async def handle_command(session: MudSession, ws: WebSocket, public_id: str, payload: dict) -> None:
    """Handles normal player command."""
    log_state_read(session.state, f"command_request_{public_id}")
    if session.writer and session.state in [ConnectionState.CONNECTED, ConnectionState.AWAITING_LOGIN]:
        command: str = payload.get("value", "")

        if getattr(session, "pending_username", None) or getattr(session, "pending_password", None):
            logger.info(f"Session {public_id}: comando manual recebido, limpando credenciais pendentes do modal")
            session.pending_username = None
            session.pending_password = None
            session.awaiting_login_choice = False

        # Validação de tamanho (evitar buffer overflow no servidor MUD)
        if len(command) > 512:
            logger.warning(f"Session {public_id}: Command too long ({len(command)} chars), truncated")
            command = command[:512]

        await session.send_to_mud((command + "\n").encode())


async def handle_raw_command(session: MudSession, public_id: str, raw_msg: str) -> None:
    """Processes raw command (backward compatibility)."""
    log_state_read(session.state, f"raw_command_{public_id}")
    if session.writer and session.state in [ConnectionState.CONNECTED, ConnectionState.AWAITING_LOGIN]:
        if parser.detect_initial_login_menu(raw_msg):
            session.awaiting_login_choice = True
        await session.send_to_mud((raw_msg + "\n").encode())
