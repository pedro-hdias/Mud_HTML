import asyncio
import time
from fastapi import WebSocket, WebSocketDisconnect
from .mud.state import log_state_read
from .sessions import SessionManager
from .logger import get_logger
from .config import (
    SESSION_TIMEOUT_MINUTES,
    WS_RATE_LIMIT_MAX_MESSAGES,
    WS_RATE_LIMIT_WINDOW_SECONDS,
    WS_CLOSE_CODES,
)
from .ws_messages import make_message, parse_message
from .ws_handlers import (
    handle_connect,
    handle_disconnect,
    handle_login,
    handle_command,
    handle_raw_command,
)

# Gerenciador global de sessões
session_manager = SessionManager(session_timeout_minutes=SESSION_TIMEOUT_MINUTES)
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
            parsed = parse_message(msg)
            if not parsed:
                raise ValueError("invalid_json")

            msg_type = parsed.get("type")
            payload = parsed.get("payload") or {}
            
            if msg_type == "init":
                # Cliente enviou publicId (e opcionalmente owner)
                public_id = payload.get("publicId")
                ownership_token = payload.get("owner")
                
                if not public_id:
                    logger.error("No publicId provided in init message")
                    await ws.send_json(make_message("error", {"message": "publicId obrigatório"}))
                    return
                
                logger.info(f"Client initialized with publicId: {public_id}")
                
                # Obtém ou cria sessão (com validação de ownership)
                session, status, is_valid = session_manager.get_or_create_session(public_id, ownership_token)
                
                # Se sessão é inválida (ownership errado, desconectada manualmente, ou limite atingido)
                if not is_valid:
                    logger.error(f"Session validation failed: {status}")
                    
                    if status == "invalid_ownership":
                        error_msg = "Sessão pertence a outro cliente. Gerando nova sessão..."
                    elif status == "manual_disconnect":
                        error_msg = "Sessão foi encerrada. Gerando nova sessão..."
                    elif status == "max_sessions":
                        error_msg = "Servidor lotado. Tente novamente mais tarde."
                    else:
                        error_msg = "Sessão inválida. Gerando nova sessão..."
                    
                    close_code = WS_CLOSE_CODES["max_sessions"] if status == "max_sessions" else WS_CLOSE_CODES["session_invalid"]
                    await ws.send_json(make_message("session_invalid", {
                        "reason": status,
                        "message": error_msg
                    }))
                    await ws.close(code=close_code, reason=status)
                    return
                
                # Sessão válida - adiciona WebSocket
                session.add_websocket(ws)
                
                # Envia o estado atual ao cliente
                log_state_read(session.state, f"send_state_to_client_{public_id}")
                await ws.send_json(make_message("state", {"value": session.state.value}))
                logger.debug(f"Sent current state to client: {session.state.value}")
                
                # Envia o histórico se existir
                if session.history:
                    logger.debug(f"Sending history to client ({len(session.history)} chars)")
                    await ws.send_json(make_message("history", {"content": session.history}))
                
                # Confirma inicialização com ownership token
                await ws.send_json(make_message("init_ok", {
                    "publicId": public_id,
                    "owner": session.owner_token,
                    "status": status,
                    "hasHistory": bool(session.history)
                }))
            else:
                logger.error(f"Expected 'init' message, got '{msg_type}'")
                await ws.send_json(make_message("error", {"message": "Primeiro envie mensagem 'init'"}))
                return
        
        except ValueError:
            logger.error("Invalid JSON in initial message")
            await ws.send_json(make_message("error", {"message": "JSON inválido"}))
            return
        
        # Rate limiting: janela deslizante de timestamps
        message_timestamps = []

        # Loop de mensagens
        while True:
            msg = await ws.receive_text()
            logger.debug(f"Session {public_id}: Received message")

            # Rate limiting check
            now = time.monotonic()
            message_timestamps = [t for t in message_timestamps if now - t < WS_RATE_LIMIT_WINDOW_SECONDS]
            message_timestamps.append(now)
            if len(message_timestamps) > WS_RATE_LIMIT_MAX_MESSAGES:
                logger.warning(f"Session {public_id}: Rate limit exceeded ({len(message_timestamps)} msgs in {WS_RATE_LIMIT_WINDOW_SECONDS}s)")
                await ws.send_json(make_message("error", {"message": "Muitas mensagens. Aguarde um momento."}))
                continue

            try:
                parsed = parse_message(msg)
                if not parsed:
                    raise ValueError("invalid_json")

                msg_type = parsed.get("type")
                payload = parsed.get("payload") or {}
                
                if msg_type == "connect":
                    await handle_connect(session, ws, public_id, session_manager)
                
                elif msg_type == "disconnect":
                    await handle_disconnect(session, ws, public_id, session_manager)
                
                elif msg_type == "login":
                    await handle_login(session, ws, public_id, payload)
                
                elif msg_type == "command":
                    await handle_command(session, ws, public_id, payload)
            
            except ValueError:
                # Mensagem não é JSON, trata como comando direto (backward compatibility)
                await handle_raw_command(session, public_id, msg)
    
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


