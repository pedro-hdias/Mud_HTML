import asyncio
import json
from fastapi import WebSocket, WebSocketDisconnect
from .mud.state import ConnectionState, log_state_read
from .sessions import SessionManager
from .logger import get_logger

# Gerenciador global de sessões
session_manager = SessionManager(session_timeout_minutes=10)
logger = get_logger("ws")


async def websocket_endpoint(ws: WebSocket):
    """Endpoint WebSocket - gerencia conexões de clientes"""
    await ws.accept()
    logger.debug("WebSocket accepted")
    
    session = None
    public_id = None
    
    try:
        # Aguarda mensagem inicial com publicId
        msg = await ws.receive_text()
        logger.debug(f"Received initial message: {msg}")
        
        try:
            data = json.loads(msg)
            msg_type = data.get("type")
            
            if msg_type == "init":
                # Cliente enviou publicId (e opcionalmente owner)
                public_id = data.get("publicId")
                ownership_token = data.get("owner")
                
                if not public_id:
                    logger.error("No publicId provided in init message")
                    await ws.send_json({"type": "error", "message": "publicId obrigatório"})
                    return
                
                logger.info(f"Client initialized with publicId: {public_id}")
                
                # Obtém ou cria sessão (com validação de ownership)
                session, status, is_valid = session_manager.get_or_create_session(public_id, ownership_token)
                
                # Se sessão é inválida (ownership errado ou desconectada manualmente)
                if not is_valid:
                    logger.error(f"Session validation failed: {status}")
                    
                    if status == "invalid_ownership":
                        error_msg = "Sessão pertence a outro cliente. Gerando nova sessão..."
                    elif status == "manual_disconnect":
                        error_msg = "Sessão foi encerrada. Gerando nova sessão..."
                    else:
                        error_msg = "Sessão inválida. Gerando nova sessão..."
                    
                    await ws.send_json({
                        "type": "session_invalid",
                        "reason": status,
                        "message": error_msg
                    })
                    await ws.close(code=4003, reason=status)
                    return
                
                # Sessão válida - adiciona WebSocket
                session.add_websocket(ws)
                
                # Envia o estado atual ao cliente
                log_state_read(session.state, f"send_state_to_client_{public_id}")
                await ws.send_json({"type": "state", "value": session.state.value})
                logger.debug(f"Sent current state to client: {session.state.value}")
                
                # Envia o histórico se existir
                if session.history:
                    logger.debug(f"Sending history to client ({len(session.history)} chars)")
                    await ws.send_json({"type": "history", "content": session.history})
                
                # Confirma inicialização com ownership token
                await ws.send_json({
                    "type": "init_ok",
                    "publicId": public_id,
                    "owner": session.owner_token,
                    "status": status,
                    "hasHistory": bool(session.history)
                })
            else:
                logger.error(f"Expected 'init' message, got '{msg_type}'")
                await ws.send_json({"type": "error", "message": "Primeiro envie mensagem 'init'"})
                return
        
        except json.JSONDecodeError:
            logger.error("Invalid JSON in initial message")
            await ws.send_json({"type": "error", "message": "JSON inválido"})
            return
        
        # Loop de mensagens
        while True:
            msg = await ws.receive_text()
            logger.debug(f"Session {public_id}: Received message")
            
            try:
                data = json.loads(msg)
                msg_type = data.get("type")
                
                if msg_type == "connect":
                    # Cliente solicitou conexão ao MUD
                    log_state_read(session.state, f"connect_request_{public_id}")
                    if session.state == ConnectionState.DISCONNECTED:
                        await session.broadcast_state(ConnectionState.CONNECTING)
                        if session.connect_to_mud():
                            await session.broadcast_state(ConnectionState.CONNECTED)
                            session.reader_task = asyncio.create_task(session.mud_reader())
                        else:
                            await session.broadcast_state(ConnectionState.DISCONNECTED)
                            logger.debug(f"Session {public_id}: MUD connection failed")
                            await ws.send_json({"type": "system", "message": "Falha ao conectar no servidor"})
                
                elif msg_type == "disconnect":
                    # Cliente solicitou desconexão do MUD
                    log_state_read(session.state, f"disconnect_request_{public_id}")
                    if session.state != ConnectionState.DISCONNECTED and session.socket:
                        # Marca como desconexão manual (invalida sessão)
                        session.manual_disconnect = True
                        logger.info(f"Session {public_id}: Marked as manual disconnect")
                        
                        # Envia comando quit
                        try:
                            logger.debug(f"Session {public_id}: Sending quit to MUD")
                            session.send_to_mud(b"quit\n")
                        except:
                            logger.exception(f"Session {public_id}: Failed to send quit to MUD")
                        # Aguarda um momento para o servidor processar
                        await asyncio.sleep(0.5)
                        await session.disconnect_from_mud()
                        
                        # Agenda remoção da sessão após 30 segundos
                        asyncio.create_task(session_manager.schedule_session_removal(public_id, delay_seconds=30))
                
                elif msg_type == "login":
                    # Cliente enviou credenciais de login
                    log_state_read(session.state, f"login_request_{public_id}")
                    if session.socket and session.state in [ConnectionState.CONNECTED, ConnectionState.AWAITING_LOGIN]:
                        username = data.get("username", "")
                        password = data.get("password", "")
                        
                        # Envia sequência de login
                        try:
                            logger.debug(f"Session {public_id}: Sending login sequence to MUD")
                            session.send_to_mud(b"p\n")
                            await asyncio.sleep(0.1)
                            session.send_to_mud((username + "\n").encode())
                            await asyncio.sleep(0.1)
                            session.send_to_mud((password + "\n").encode())
                        except Exception as e:
                            logger.exception(f"Session {public_id}: Error sending login: {e}")
                
                elif msg_type == "command":
                    # Cliente enviou comando normal
                    log_state_read(session.state, f"command_request_{public_id}")
                    if session.socket and session.state == ConnectionState.CONNECTED:
                        command = data.get("value", "")
                        logger.debug(f"Session {public_id}: Sending command to MUD")
                        session.send_to_mud((command + "\n").encode())
            
            except json.JSONDecodeError:
                # Mensagem não é JSON, trata como comando direto (backward compatibility)
                log_state_read(session.state, f"raw_command_{public_id}")
                if session.socket and session.state == ConnectionState.CONNECTED:
                    logger.debug(f"Session {public_id}: Sending raw command to MUD")
                    session.send_to_mud((msg + "\n").encode())
    
    except WebSocketDisconnect as e:
        logger.info(f"Session {public_id}: WebSocket disconnected (code: {e.code})")
    except Exception as e:
        logger.exception(f"Session {public_id}: WebSocket error: {e}")
    finally:
        # Remove cliente da sessão
        if session and ws in session.websocket_clients:
            logger.info(f"Session {public_id}: Removing WebSocket from session")
            session.remove_websocket(ws)
            logger.info(f"Session {public_id}: WebSocket removed, {len(session.websocket_clients)} clients remaining")


