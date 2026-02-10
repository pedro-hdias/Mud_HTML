"""
MudSession - Representa uma sessão individual de conexão ao MUD
Encapsula socket, histórico, estado e clientes WebSocket
"""
import asyncio
import socket
import secrets
from datetime import datetime
from typing import Set
from fastapi import WebSocket

from ..mud.state import ConnectionState, log_state_change, log_state_read
from ..mud import parser
from ..config import (
    MUD_HOST,
    MUD_PORT,
    MUD_READ_BUFFER_SIZE,
    MUD_IDLE_SLEEP_SECONDS,
    MUD_PARTIAL_BUFFER_MAX_BYTES,
    HISTORY_MAX_BYTES,
    HISTORY_MAX_LINES
)
from ..ws_messages import make_message
from ..logger import get_logger

logger = get_logger("session")


class MudSession:
    """Representa uma sessão individual de um jogador no MUD"""
    
    def __init__(self, public_id: str):
        self.public_id = public_id  # ID público da sessão
        self.owner_token = secrets.token_urlsafe(32)  # Prova de propriedade (secreto)
        self.reader = None
        self.writer = None
        self.history = ""
        self.partial_buffer = ""
        self.reader_task: asyncio.Task = None
        self.websocket_clients: Set[WebSocket] = set()
        self.state = ConnectionState.DISCONNECTED
        self.last_activity = datetime.now()
        self.manual_disconnect = False  # Flag para desconexão intencional
        
        logger.info(f"Session created: {public_id} (owner: {self.owner_token[:8]}...)")
    
    def touch(self):
        """Atualiza timestamp da última atividade"""
        self.last_activity = datetime.now()
    
    def add_websocket(self, ws: WebSocket):
        """Adiciona um cliente WebSocket a esta sessão"""
        self.websocket_clients.add(ws)
        self.touch()
        logger.debug(f"Session {self.public_id}: WebSocket added (total: {len(self.websocket_clients)})")
    
    def remove_websocket(self, ws: WebSocket):
        """Remove um cliente WebSocket desta sessão"""
        if ws in self.websocket_clients:
            self.websocket_clients.remove(ws)
            logger.debug(f"Session {self.public_id}: WebSocket removed (remaining: {len(self.websocket_clients)})")
    
    def has_clients(self) -> bool:
        """Verifica se a sessão tem clientes conectados"""
        return len(self.websocket_clients) > 0
    
    async def broadcast_state(self, state: ConnectionState):
        """Notifica todos os clientes desta sessão sobre mudança de estado"""
        previous_state = self.state
        self.state = state
        log_state_change(previous_state, state, f"session_{self.public_id}")
        
        message = make_message("state", {"value": state.value})
        disconnected_clients = []
        
        for ws in list(self.websocket_clients):
            try:
                logger.debug(f"Session {self.public_id}: Sending state {state.value} to client")
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"Session {self.public_id}: Failed to send state to client, marking for removal: {e}")
                disconnected_clients.append(ws)
        
        # Remove clientes desconectados
        for ws in disconnected_clients:
            self.remove_websocket(ws)
    
    async def broadcast_message(self, message: dict):
        """Envia mensagem para todos os clientes desta sessão"""
        disconnected_clients = []
        
        for ws in list(self.websocket_clients):
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"Session {self.public_id}: Failed to send message to client, marking for removal: {e}")
                disconnected_clients.append(ws)
        
        # Remove clientes desconectados
        for ws in disconnected_clients:
            self.remove_websocket(ws)
    async def connect_to_mud(self) -> bool:
        """Conecta ao servidor MUD"""
        try:
            logger.debug(f"Session {self.public_id}: Opening connection to {MUD_HOST}:{MUD_PORT}")
            self.reader, self.writer = await asyncio.open_connection(MUD_HOST, MUD_PORT)
            logger.info(f"Session {self.public_id}: TCP connection established")
            self.touch()
            return True
        except Exception as e:
            logger.exception(f"Session {self.public_id}: Connection failed: {e}")
            self.reader = None
            self.writer = None
            return False
    
    async def close_mud_connection(self):
        """Fecha a conexão com o MUD"""
        if self.writer:
            try:
                logger.debug(f"Session {self.public_id}: Closing connection")
                self.writer.close()
                await self.writer.wait_closed()
                logger.debug(f"Session {self.public_id}: Connection closed")
            except Exception as e:
                logger.exception(f"Session {self.public_id}: Close failed: {e}")
            self.writer = None
            self.reader = None
    
    async def send_to_mud(self, data: bytes):
        """Envia dados para o MUD"""
        if self.writer:
            try:
                logger.debug(f"Session {self.public_id}: Sending {len(data)} bytes")
                self.writer.write(data)
                await self.writer.drain()
                self.touch()
            except Exception as e:
                logger.exception(f"Session {self.public_id}: Send failed: {e}")
                raise

    def _append_history(self, text: str):
        if not text:
            return

        self.history += text

        if HISTORY_MAX_BYTES and len(self.history) > HISTORY_MAX_BYTES:
            self.history = self.history[-HISTORY_MAX_BYTES:]

        if HISTORY_MAX_LINES:
            lines = self.history.splitlines(keepends=True)
            if len(lines) > HISTORY_MAX_LINES:
                self.history = "".join(lines[-HISTORY_MAX_LINES:])
    
    async def disconnect_from_mud(self):
        """Desconecta do MUD e limpa recursos (preserva histórico para reconexão)"""
        logger.debug(f"Session {self.public_id}: Disconnecting from MUD")
        
        # Cancela a task de leitura se existir
        if self.reader_task and not self.reader_task.done():
            logger.debug(f"Session {self.public_id}: Cancelling MUD reader task")
            self.reader_task.cancel()
            try:
                await self.reader_task
            except asyncio.CancelledError:
                logger.debug(f"Session {self.public_id}: MUD reader task cancelled")
        
        # Fecha a conexão
        await self.close_mud_connection()
        
        self.reader_task = None
        # Não limpa self.history aqui — preserva para reconexão.
        # O histórico só é apagado em clear_session() quando a sessão é removida.
        self.partial_buffer = ""
        
        await self.broadcast_state(ConnectionState.DISCONNECTED)

    def clear_session(self):
        """Limpa todos os dados da sessão (usado pelo manager ao remover)"""
        self.history = ""
        self.partial_buffer = ""
        logger.debug(f"Session {self.public_id}: Session data cleared")
    
    async def mud_reader(self):
        """Task assíncrona que lê dados do MUD continuamente"""
        logger.debug(f"Session {self.public_id}: MUD reader started")
        
        while True:
            try:
                data = await self.reader.read(MUD_READ_BUFFER_SIZE)
                if not data:
                    # Conexão fechada pelo servidor
                    logger.debug(f"Session {self.public_id}: MUD connection closed by server")
                    await self.disconnect_from_mud()
                    await self.broadcast_message(make_message("system", {
                        "message": "Conexão encerrada pelo servidor"
                    }))
                    break
                
                text = data.decode(errors="ignore")
                logger.debug(f"Session {self.public_id}: Received {len(text)} chars")
                self.partial_buffer += text
                self._append_history(text)
                
                # Processa linhas completas
                while "\n" in self.partial_buffer:
                    if "\r\n" in self.partial_buffer:
                        line, self.partial_buffer = self.partial_buffer.split("\r\n", 1)
                        line += "\r\n"
                    else:
                        line, self.partial_buffer = self.partial_buffer.split("\n", 1)
                        line += "\n"
                    
                    if parser.detect_disconnection(line):
                        await self.broadcast_message(make_message("line", {"content": line}))
                        await self.disconnect_from_mud()
                        await self.broadcast_message(make_message("system", {
                            "message": "Desconectado do servidor"
                        }))
                        return
                    
                    await self.broadcast_message(make_message("line", {"content": line}))

                # Se sobrou algo no buffer e parece ser um prompt (curto e sem newline), envia também
                # Isso resolve o problema de telas de login/prompts que não enviam \n
                if self.partial_buffer:
                    # Proteção: flush forçado se buffer exceder limite
                    if len(self.partial_buffer) > MUD_PARTIAL_BUFFER_MAX_BYTES:
                        logger.warning(f"Session {self.public_id}: Partial buffer overflow ({len(self.partial_buffer)} bytes), force flushing")
                        await self.broadcast_message(make_message("line", {"content": self.partial_buffer}))
                        self.partial_buffer = ""
                    elif len(self.partial_buffer) < 1024 or parser.detect_input_prompt(self.partial_buffer):
                        logger.debug(f"Sending partial buffer as prompt: {self.partial_buffer[:50]}")
                        await self.broadcast_message(make_message("line", {"content": self.partial_buffer}))
                        # Limpa o buffer pois já enviamos
                        self.partial_buffer = ""

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception(f"Session {self.public_id}: Error reading from MUD: {e}")
                await self.disconnect_from_mud()
                await self.broadcast_message(make_message("system", {
                    "message": f"Erro de conexão: {e}"
                }))
                break