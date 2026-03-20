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
from app.ws_handlers import handle_login


def test_handle_login_repassa_username_e_password_sem_comando_prefixo() -> None:
    """handle_login deve enviar username e password exatamente como recebidos."""
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

    assert sent == [
        b"MeuUser\n",
        "S3nh@ Forte  \n".encode("utf-8"),
    ]


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

    assert sent[1] == b"  senha com espacos  \n"


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
