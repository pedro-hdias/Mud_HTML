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
from ..mud.menu_detector import MenuDetector
from ..config import (
    MUD_HOST,
    MUD_PORT,
    MUD_READ_BUFFER_SIZE,
    MUD_IDLE_SLEEP_SECONDS,
    MUD_PARTIAL_BUFFER_MAX_BYTES,
    MUD_CONNECTION_TIMEOUT_SECONDS,
    HISTORY_MAX_BYTES,
    HISTORY_MAX_LINES
)
from ..ws_messages import make_message
from ..logger import get_logger
from ..sounds import get_sound_engine

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
        self.sound_engine = get_sound_engine()
        self.menu_detector = MenuDetector()
        
        logger.info(f"Session created: {public_id} (owner: {self.owner_token[:8]}...)")
    
    def touch(self):
        """Atualiza timestamp da última atividade"""
        self.last_activity = datetime.now()
    
    def add_websocket(self, ws: WebSocket):
        """Adiciona um cliente WebSocket a esta sessão"""
        self.websocket_clients.add(ws)
        self.touch()
    
    def remove_websocket(self, ws: WebSocket):
        """Remove um cliente WebSocket desta sessão"""
        if ws in self.websocket_clients:
            self.websocket_clients.remove(ws)
    
    def has_clients(self) -> bool:
        """Verifica se a sessão tem clientes conectados"""
        return len(self.websocket_clients) > 0
    
    def get_recent_history(self, num_lines: int = 25) -> str:
        """
        Retorna as últimas N linhas do histórico
        Usado ao conectar para enviar apenas histórico recente
        """
        if not self.history:
            return ""
        
        lines = self.history.split('\n')
        # Retorna o máximo de linhas pedidas, ou menos se o histórico for menor
        start_idx = max(0, len(lines) - num_lines)
        return '\n'.join(lines[start_idx:])
    
    def get_history_slice(self, from_line_index: int, num_lines: int = 25) -> dict:
        """
        Retorna um slice de histórico anterior ao from_line_index
        Usado para carregar histórico antigo (lazy loading)
        
        Args:
            from_line_index: índice (do fim) a partir do qual carregar histórico anterior
            num_lines: número de linhas a carregar
        
        Returns:
            dict com 'content' (linhas), 'total_lines' (total no histórico) e 'has_more' (se há mais antes)
        """
        if not self.history:
            return {
                "content": "",
                "total_lines": 0,
                "has_more": False,
                "from_line_index": 0,
                "returned_lines": 0
            }
        
        lines = self.history.split('\n')
        total = len(lines)
        
        # from_line_index é contado do final: 0 = últimas linhas, 1 = penúltima, etc
        # Queremos carregar histórico ANTERIOR a esse ponto
        start_idx = max(0, total - from_line_index - num_lines)
        end_idx = max(0, total - from_line_index)
        
        if start_idx >= end_idx:
            return {
                "content": "",
                "total_lines": total,
                "has_more": False,
                "from_line_index": from_line_index,
                "returned_lines": 0
            }
        
        slice_lines = lines[start_idx:end_idx]
        has_more = start_idx > 0
        
        return {
            "content": '\n'.join(slice_lines),
            "total_lines": total,
            "has_more": has_more,
            "from_line_index": from_line_index,
            "returned_lines": len(slice_lines)
        }
    
    async def broadcast_state(self, state: ConnectionState):
        """Notifica todos os clientes desta sessão sobre mudança de estado"""
        previous_state = self.state
        self.state = state
        log_state_change(previous_state, state, f"session_{self.public_id}")
        
        message = make_message("state", {"value": state.value})
        disconnected_clients = []
        
        for ws in list(self.websocket_clients):
            try:
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
        """Connects to the MUD server"""
        try:
            self.reader, self.writer = await asyncio.wait_for(
                asyncio.open_connection(MUD_HOST, MUD_PORT),
                timeout=MUD_CONNECTION_TIMEOUT_SECONDS
            )
            logger.info(f"Session {self.public_id}: TCP connection established")
            self.touch()
            return True
        except asyncio.TimeoutError:
            logger.error(f"Session {self.public_id}: Connection timed out after {MUD_CONNECTION_TIMEOUT_SECONDS}s")
            self.reader = None
            self.writer = None
            return False
        except Exception as e:
            logger.exception(f"Session {self.public_id}: Connection failed: {e}")
            self.reader = None
            self.writer = None
            return False
    
    async def close_mud_connection(self):
        """Fecha a conexão com o MUD"""
        if self.writer:
            try:
                self.writer.close()
                await self.writer.wait_closed()
            except Exception as e:
                logger.exception(f"Session {self.public_id}: Close failed: {e}")
            self.writer = None
            self.reader = None
    
    async def send_to_mud(self, data: bytes):
        """Envia dados para o MUD"""
        if self.writer:
            try:
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
        # Cancela a task de leitura se existir
        if self.reader_task and not self.reader_task.done():
            self.reader_task.cancel()
            try:
                await self.reader_task
            except asyncio.CancelledError:
                pass
        
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
    
    async def mud_reader(self):
        """Task assíncrona que lê dados do MUD continuamente"""

        while True:
            try:
                data = await self.reader.read(MUD_READ_BUFFER_SIZE)
                if not data:
                    # Conexão fechada pelo servidor
                    await self.disconnect_from_mud()
                    await self.broadcast_message(make_message("system", {
                        "message": "Connection closed by server"
                    }))
                    break
                
                text = data.decode(errors="ignore")
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
                            "message": "Disconnected from server"
                        }))
                        return

                    menu_outputs = self.menu_detector.process_line(line)

                    for output_item in menu_outputs:
                        if output_item.get("type") == "menu":
                            await self.broadcast_message(make_message("menu", output_item.get("payload", {})))
                            continue

                        output_line = output_item.get("content", "")
                        if not output_line:
                            continue

                        # Processa sons e rastreia omissão/reescrita
                        sound_events = self.sound_engine.process_line(output_line)
                        if sound_events:
                            await self.broadcast_message(make_message("sound", {"events": sound_events}))

                        # Respeita flag omit_from_output
                        should_omit = self.sound_engine.get_last_omit_status()
                        rewritten_text = self.sound_engine.get_last_rewritten_text()
                        
                        if should_omit:
                            # Se omit_from_output=True, não envia linha original
                            if rewritten_text:
                                # Mas se foi reescrita via Note(), envia versão reescrita
                                await self.broadcast_message(make_message("line", {"content": rewritten_text}))
                            # Senão, suprime totalmente (não envia nada)
                        else:
                            # Sem omit_from_output, envia linha original normalmente
                            await self.broadcast_message(make_message("line", {"content": output_line}))

                # Se sobrou algo no buffer e parece ser um prompt (curto e sem newline), envia também
                # Isso resolve o problema de telas de login/prompts que não enviam \n
                if self.partial_buffer:
                    # Proteção: flush forçado se buffer exceder limite
                    if len(self.partial_buffer) > MUD_PARTIAL_BUFFER_MAX_BYTES:
                        logger.warning(f"Session {self.public_id}: Partial buffer overflow ({len(self.partial_buffer)} bytes), force flushing")
                        self.sound_engine.process_line(self.partial_buffer)
                        should_omit = self.sound_engine.get_last_omit_status()
                        rewritten_text = self.sound_engine.get_last_rewritten_text()
                        
                        if not should_omit or rewritten_text:
                            content = rewritten_text if rewritten_text else self.partial_buffer
                            await self.broadcast_message(make_message("line", {"content": content}))
                        self.partial_buffer = ""
                    elif len(self.partial_buffer) < 1024 or parser.detect_input_prompt(self.partial_buffer):
                        self.sound_engine.process_line(self.partial_buffer)
                        should_omit = self.sound_engine.get_last_omit_status()
                        rewritten_text = self.sound_engine.get_last_rewritten_text()
                        
                        if not should_omit or rewritten_text:
                            content = rewritten_text if rewritten_text else self.partial_buffer
                            await self.broadcast_message(make_message("line", {"content": content}))
                        # Limpa o buffer pois já enviamos
                        self.partial_buffer = ""

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception(f"Session {self.public_id}: Error reading from MUD: {e}")
                await self.disconnect_from_mud()
                await self.broadcast_message(make_message("system", {
                    "message": f"Connection error: {e}"
                }))
                break