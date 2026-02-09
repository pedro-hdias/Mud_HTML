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
        self.socket: socket.socket = None
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
    
    def connect_to_mud(self) -> bool:
        """Conecta ao servidor MUD"""
        try:
            logger.debug(f"Session {self.public_id}: Opening TCP socket to {MUD_HOST}:{MUD_PORT}")
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.connect((MUD_HOST, MUD_PORT))
            self.socket.setblocking(False)
            logger.info(f"Session {self.public_id}: TCP socket connected")
            self.touch()
            return True
        except Exception as e:
            logger.exception(f"Session {self.public_id}: TCP socket connection failed: {e}")
            self.socket = None
            return False
    
    def close_mud_socket(self):
        """Fecha o socket TCP do MUD"""
        if self.socket:
            try:
                logger.debug(f"Session {self.public_id}: Closing TCP socket")
                self.socket.close()
                logger.debug(f"Session {self.public_id}: TCP socket closed")
            except Exception as e:
                logger.exception(f"Session {self.public_id}: TCP socket close failed: {e}")
            self.socket = None
    
    def send_to_mud(self, data: bytes):
        """Envia dados para o MUD"""
        if self.socket:
            try:
                logger.debug(f"Session {self.public_id}: Sending {len(data)} bytes to MUD")
                self.socket.sendall(data)
                self.touch()
            except Exception as e:
                logger.exception(f"Session {self.public_id}: Socket send failed: {e}")
                raise
    
    def receive_from_mud(self, buffer_size=MUD_READ_BUFFER_SIZE) -> bytes:
        """Recebe dados do MUD"""
        if self.socket:
            try:
                data = self.socket.recv(buffer_size)
                if data:
                    logger.debug(f"Session {self.public_id}: Received {len(data)} bytes from MUD")
                    self.touch()
                return data
            except BlockingIOError:
                # Não é erro - socket non-blocking sem dados disponíveis
                # Re-raise para o caller tratar
                raise
            except Exception as e:
                # Erros reais (socket fechado, timeout, etc)
                logger.exception(f"Session {self.public_id}: Socket receive failed: {e}")
                raise
        return None

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
        """Desconecta do MUD e limpa recursos"""
        logger.debug(f"Session {self.public_id}: Disconnecting from MUD")
        
        # Cancela a task de leitura se existir
        if self.reader_task and not self.reader_task.done():
            logger.debug(f"Session {self.public_id}: Cancelling MUD reader task")
            self.reader_task.cancel()
            try:
                await self.reader_task
            except asyncio.CancelledError:
                logger.debug(f"Session {self.public_id}: MUD reader task cancelled")
        
        # Fecha o socket
        self.close_mud_socket()
        
        self.reader_task = None
        self.history = ""
        self.partial_buffer = ""
        
        await self.broadcast_state(ConnectionState.DISCONNECTED)
    
    async def mud_reader(self):
        """Task assíncrona que lê dados do MUD continuamente"""
        logger.debug(f"Session {self.public_id}: MUD reader started")
        
        consecutive_errors = 0
        max_consecutive_errors = 10
        
        while True:
            try:
                data = self.receive_from_mud()
                if not data:
                    # Socket fechado pelo servidor
                    logger.debug(f"Session {self.public_id}: MUD socket closed by server")
                    await self.disconnect_from_mud()
                    await self.broadcast_message(make_message("system", {
                        "message": "Conexão encerrada pelo servidor"
                    }))
                    break
                
                # Reseta contador de erros ao receber dados com sucesso
                consecutive_errors = 0
                
                text = data.decode(errors="ignore")
                logger.debug(f"Session {self.public_id}: Received MUD data chunk: {len(text)} chars")
                self.partial_buffer += text
                self._append_history(text)
                
                # Processa linhas completas (delimitadas por \n ou \r\n)
                while "\n" in self.partial_buffer:
                    # Encontra o próximo delimitador
                    if "\r\n" in self.partial_buffer:
                        line, self.partial_buffer = self.partial_buffer.split("\r\n", 1)
                        line += "\r\n"
                    else:
                        line, self.partial_buffer = self.partial_buffer.split("\n", 1)
                        line += "\n"
                    
                    # Detecta desconexão pelo padrão "*** Disconnected ***"
                    if parser.detect_disconnection(line):
                        # Envia a linha primeiro
                        await self.broadcast_message(make_message("line", {"content": line}))
                        
                        # Depois desconecta
                        await self.disconnect_from_mud()
                        await self.broadcast_message(make_message("system", {
                            "message": "Desconectado do servidor"
                        }))
                        return
                    
                    # Envia cada linha completa como um evento separado
                    await self.broadcast_message(make_message("line", {"content": line}))
            
            except BlockingIOError:
                # BlockingIOError não é um erro - é normal quando não há dados disponíveis
                # O servidor pode estar aguardando input do usuário (menu, prompt, etc)
                # Não incrementa o contador de erros
                await asyncio.sleep(MUD_IDLE_SLEEP_SECONDS)
            except Exception as e:
                logger.exception(f"Session {self.public_id}: Error reading from MUD: {e}")
                await self.disconnect_from_mud()
                await self.broadcast_message(make_message("system", {
                    "message": f"Erro de conexão: {e}"
                }))
                break

