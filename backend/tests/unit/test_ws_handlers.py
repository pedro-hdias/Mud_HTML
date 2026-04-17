"""
Testes unitários para handlers WebSocket.
Cobre preservação de credenciais no fluxo de login.
"""

import asyncio
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock

from fastapi import WebSocket

from app.mud.state import ConnectionState
from app.sessions.mud_reader import MudReader
from app.ws_handlers import handle_login


def test_handle_login_repassa_username_e_password_quando_ja_esta_no_prompt() -> None:
    """handle_login deve enviar o username quando o servidor já está no prompt correspondente."""
    sent = []

    async def _send(data: bytes) -> None:
        sent.append(data)

    session = SimpleNamespace(
        writer=True,
        state=ConnectionState.CONNECTED,
        send_to_mud=AsyncMock(side_effect=_send),
    )

    payload = {
        "username": "MeuUser",
        "password": "S3nh@ Forte  "
    }

    asyncio.run(handle_login(cast(Any, session), ws=cast(WebSocket, AsyncMock()), public_id="sess-1", payload=payload))

    assert sent == [b"MeuUser\n"]
    assert session.pending_username is None
    assert session.pending_password == "S3nh@ Forte  "


def test_handle_login_preserva_espacos_na_senha() -> None:
    """A senha deve ser enviada fielmente, incluindo espaços no início/fim."""
    sent = []

    async def _send(data: bytes) -> None:
        sent.append(data)

    session = SimpleNamespace(
        writer=True,
        state=ConnectionState.CONNECTED,
        send_to_mud=AsyncMock(side_effect=_send),
    )

    payload = {
        "username": "user",
        "password": "  senha com espacos  "
    }

    asyncio.run(handle_login(cast(Any, session), ws=cast(WebSocket, AsyncMock()), public_id="sess-2", payload=payload))

    assert sent == [b"user\n"]
    assert session.pending_username is None
    assert session.pending_password == "  senha com espacos  "


def test_handle_login_ignora_payload_invalido() -> None:
    """Quando tipos são inválidos, não deve enviar dados ao MUD."""
    send_to_mud = AsyncMock()
    session = SimpleNamespace(
        writer=True,
        state=ConnectionState.CONNECTED,
        send_to_mud=send_to_mud,
    )

    payload = {
        "username": "user",
        "password": 12345,
    }

    asyncio.run(handle_login(cast(Any, session), ws=cast(WebSocket, AsyncMock()), public_id="sess-3", payload=payload))

    send_to_mud.assert_not_awaited()


def test_handle_login_envia_usuario_e_aguarda_prompt_para_senha() -> None:
    """O fluxo do modal deve sincronizar a senha com o prompt real do servidor."""
    sent = []

    async def _send(data: bytes) -> None:
        sent.append(data)

    session = SimpleNamespace(
        writer=True,
        state=ConnectionState.CONNECTED,
        send_to_mud=AsyncMock(side_effect=_send),
        awaiting_login_choice=True,
        pending_username=None,
        pending_password=None,
    )

    payload = {
        "username": "MeuUser",
        "password": "SenhaSegura"
    }

    asyncio.run(handle_login(cast(Any, session), ws=cast(WebSocket, AsyncMock()), public_id="sess-4", payload=payload))

    assert sent == [b"p\n"]
    assert session.pending_username == "MeuUser"
    assert session.pending_password == "SenhaSegura"


def test_mud_reader_envia_credenciais_pendentes_quando_prompts_chegam() -> None:
    """Ao detectar username e password, o backend deve enviar cada credencial uma única vez."""
    sent = []

    async def _send(data: bytes) -> None:
        sent.append(data)

    session = SimpleNamespace(
        awaiting_login_choice=True,
        pending_username="MeuUser",
        pending_password="SenhaSegura",
        send_to_mud=AsyncMock(side_effect=_send),
        touch=lambda: None,
        public_id="sess-5",
    )

    reader = MudReader(session)
    asyncio.run(reader._flush_pending_credentials_if_needed("Username: "))
    asyncio.run(reader._flush_pending_credentials_if_needed("Password: "))
    asyncio.run(reader._flush_pending_credentials_if_needed("Password: "))

    assert sent == [b"MeuUser\n", b"SenhaSegura\n"]
    assert session.pending_username is None
    assert session.pending_password is None
