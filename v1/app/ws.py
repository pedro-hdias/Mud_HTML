import asyncio
import json
from fastapi import WebSocket
from .mud.state import ConnectionState, log_state_change, log_state_read
from .mud import client as mud_client
from .mud import parser
from .logger import get_logger

mud_history = ""  # Histórico completo (enviado apenas uma vez a novos clientes)
mud_partial_buffer = ""  # Buffer para texto incompleto (aguardando delimitador)
mud_task = None
clients = set()
connection_state = ConnectionState.DISCONNECTED
logger = get_logger("ws")

async def broadcast_state(state: ConnectionState):
    """Notifica todos os clientes sobre mudança de estado"""
    global connection_state
    previous_state = connection_state
    connection_state = state
    log_state_change(previous_state, state, "broadcast_state")
    message = {"type": "state", "value": state.value}
    for ws in list(clients):
        try:
            logger.debug(f"Sending state to client: {state.value}")
            await ws.send_json(message)
        except:
            logger.exception("Failed to send state to client")

async def disconnect_from_mud():
    """Desconecta do MUD e limpa recursos"""
    global mud_task, mud_history, mud_partial_buffer

    logger.debug("Disconnecting from MUD")
    
    # Cancela a task de leitura se existir
    if mud_task and not mud_task.done():
        logger.debug("Cancelling MUD reader task")
        mud_task.cancel()
        try:
            await mud_task
        except asyncio.CancelledError:
            logger.debug("MUD reader task cancelled")
    
    # Fecha o socket se existir
    mud_client.close_socket()
    
    mud_task = None
    mud_history = ""
    mud_partial_buffer = ""
    
    await broadcast_state(ConnectionState.DISCONNECTED)

async def mud_reader():
    global mud_history, mud_partial_buffer

    logger.debug("MUD reader started")

    while True:
        try:
            data = mud_client.receive_from_mud()
            if not data:
                # Socket fechado pelo servidor
                logger.debug("MUD socket closed by server")
                await disconnect_from_mud()
                for ws in list(clients):
                    logger.debug("Sending system message: server closed connection")
                    await ws.send_json({"type": "system", "message": "Conexão encerrada pelo servidor"})
                break
                
            text = data.decode(errors="ignore")
            logger.debug(f"Received MUD data chunk: {len(text)} chars")
            mud_partial_buffer += text
            mud_history += text

            # Processa linhas completas (delimitadas por \n ou \r\n)
            while "\n" in mud_partial_buffer:
                # Encontra o próximo delimitador
                if "\r\n" in mud_partial_buffer:
                    line, mud_partial_buffer = mud_partial_buffer.split("\r\n", 1)
                    line += "\r\n"
                else:
                    line, mud_partial_buffer = mud_partial_buffer.split("\n", 1)
                    line += "\n"

                # Detecta desconexão pelo padrão "*** Disconnected ***"
                if parser.detect_disconnection(line):
                    # Envia a linha primeiro
                    for ws in list(clients):
                        logger.debug("Sending line before disconnection")
                        await ws.send_json({"type": "line", "content": line})
                    
                    # Depois desconecta
                    await disconnect_from_mud()
                    for ws in list(clients):
                        logger.debug("Sending system message: disconnected from server")
                        await ws.send_json({"type": "system", "message": "Desconectado do servidor"})
                    return

                # Envia cada linha completa como um evento separado
                for ws in list(clients):
                    logger.debug("Sending line to client")
                    await ws.send_json({"type": "line", "content": line})

        except BlockingIOError:
            await asyncio.sleep(0.05)
        except Exception as e:
            logger.exception(f"Error reading from MUD: {e}")
            await disconnect_from_mud()
            for ws in list(clients):
                logger.debug("Sending system message: connection error")
                await ws.send_json({"type": "system", "message": f"Erro de conexão: {e}"})
            break

async def websocket_endpoint(ws: WebSocket):
    global mud_task

    await ws.accept()
    clients.add(ws)
    logger.debug("WebSocket accepted")

    # Envia o estado atual ao novo cliente
    log_state_read(connection_state, "send_state_to_new_client")
    await ws.send_json({"type": "state", "value": connection_state.value})
    logger.debug(f"Sent current state to new client: {connection_state.value}")

    # Envia o histórico completo apenas uma vez ao novo cliente
    if mud_history:
        logger.debug("Sending history to new client")
        await ws.send_json({"type": "history", "content": mud_history})

    try:
        while True:
            msg = await ws.receive_text()
            logger.debug("Received WebSocket message")
            
            # Parse da mensagem JSON
            try:
                data = json.loads(msg)
                msg_type = data.get("type")
                
                if msg_type == "connect":
                    # Cliente solicitou conexão
                    log_state_read(connection_state, "connect_request")
                    if connection_state == ConnectionState.DISCONNECTED:
                        await broadcast_state(ConnectionState.CONNECTING)
                        if mud_client.connect_to_mud():
                            await broadcast_state(ConnectionState.CONNECTED)
                            mud_task = asyncio.create_task(mud_reader())
                        else:
                            await broadcast_state(ConnectionState.DISCONNECTED)
                            logger.debug("Sending system message: MUD connection failed")
                            await ws.send_json({"type": "system", "message": "Falha ao conectar no servidor"})
                
                elif msg_type == "disconnect":
                    # Cliente solicitou desconexão
                    log_state_read(connection_state, "disconnect_request")
                    if connection_state != ConnectionState.DISCONNECTED and mud_client.mud_socket:
                        # Envia comando quit
                        try:
                            logger.debug("Sending quit to MUD")
                            mud_client.send_to_mud(b"quit\n")
                        except:
                            logger.exception("Failed to send quit to MUD")
                        # Aguarda um momento para o servidor processar
                        await asyncio.sleep(0.5)
                        await disconnect_from_mud()
                
                elif msg_type == "login":
                    # Cliente enviou credenciais de login
                    log_state_read(connection_state, "login_request")
                    if mud_client.mud_socket and connection_state in [ConnectionState.CONNECTED, ConnectionState.AWAITING_LOGIN]:
                        username = data.get("username", "")
                        password = data.get("password", "")
                        
                        # Envia sequência de login
                        try:
                            logger.debug("Sending login sequence to MUD")
                            mud_client.send_to_mud(b"p\n")
                            await asyncio.sleep(0.1)
                            mud_client.send_to_mud((username + "\n").encode())
                            await asyncio.sleep(0.1)
                            mud_client.send_to_mud((password + "\n").encode())
                        except Exception as e:
                            logger.exception(f"Error sending login: {e}")
                
                elif msg_type == "command":
                    # Cliente enviou comando normal
                    log_state_read(connection_state, "command_request")
                    if mud_client.mud_socket and connection_state == ConnectionState.CONNECTED:
                        command = data.get("value", "")
                        logger.debug("Sending command to MUD")
                        mud_client.send_to_mud((command + "\n").encode())
                
            except json.JSONDecodeError:
                # Mensagem não é JSON, trata como comando direto (backward compatibility)
                log_state_read(connection_state, "raw_command_request")
                if mud_client.mud_socket and connection_state == ConnectionState.CONNECTED:
                    logger.debug("Sending raw command to MUD")
                    mud_client.send_to_mud((msg + "\n").encode())
                    
    except Exception as e:
        logger.exception(f"WebSocket error: {e}")
    finally:
        logger.debug("WebSocket disconnect")
        clients.remove(ws)
