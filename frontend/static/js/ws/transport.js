/**
 * ws/transport.js - Camada de transporte WebSocket
 * Gerencia o objeto WebSocket, envio de mensagens e tratamento de eventos.
 */

// Objeto WebSocket ativo
let ws = null;

// Guard de idempotência para limpeza de disconnect
let _disconnectGuard = false;

/**
 * Envia uma mensagem ao servidor via WebSocket.
 * @param {string} type - Tipo da mensagem
 * @param {Object} payload - Corpo da mensagem
 * @param {Object} meta - Metadados extras
 * @returns {boolean} Verdadeiro se enviado com sucesso
 */
function sendMessage(type, payload = {}, meta = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        wsLogger.error("Não é possível enviar mensagem - WebSocket não conectado", type);
        return false;
    }

    ws.send(JSON.stringify(buildMessage(type, payload, {
        clientTs: Date.now(),
        ...meta
    })));
    return true;
}

/**
 * Handler único e idempotente de disconnect — executa a limpeza apenas uma vez.
 * @param {string} reason - Motivo da desconexão
 */
function handleDisconnect(reason) {
    if (_disconnectGuard) {
        wsLogger.debug("Disconnect já tratado, ignorando:", reason);
        return;
    }
    _disconnectGuard = true;
    wsLogger.log("Tratando disconnect:", reason);

    // Para a fila de saída
    _stopOutgoingQueue();

    // Reseta o estado do menu
    if (typeof MenuManager !== "undefined") MenuManager.reset();
}

/**
 * Cria e conecta o WebSocket ao servidor.
 */
function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        wsLogger.log("WebSocket já conectado ou conectando");
        return;
    }

    wsLogger.log("Criando WebSocket", wsUrl);
    ws = new WebSocket(wsUrl);

    // Associa handlers de eventos WebSocket
    ws.onopen = handleWebSocketOpen;
    ws.onmessage = handleWebSocketMessage;
    ws.onerror = handleWebSocketError;
    ws.onclose = handleWebSocketClose;
}

/**
 * Executado quando uma mensagem é recebida do servidor.
 * @param {MessageEvent} event
 */
function handleWebSocketMessage(event) {
    try {
        wsLogger.debug("Mensagem WebSocket recebida", event.data);
        const msg = parseMessage(event.data);
        if (!msg) return;

        switch (msg.type) {
            case "init_ok":
                handleInitOkMessage(msg.payload || {});
                break;
            case "session_invalid":
                handleSessionInvalidMessage(msg.payload || {});
                break;
            case "state":
                handleStateMessage(msg.payload || {});
                break;
            case "history":
                handleHistoryMessage(msg.payload || {});
                break;
            case "history_slice":
                handleHistorySliceMessage(msg.payload || {});
                break;
            case "line":
                handleLineMessage(msg.payload || {});
                break;
            case "menu":
                handleMenuMessage(msg.payload || {});
                break;
            case "system":
                handleSystemMessage(msg.payload || {});
                break;
            case "sound":
                handleSoundMessage(msg.payload || {});
                break;
            case "error":
                handleErrorMessage(msg.payload || {});
                break;
            default:
                wsLogger.warn("Tipo de mensagem desconhecido", msg.type);
        }
    } catch (e) {
        wsLogger.error("Erro ao processar mensagem", e, event.data);
    }
}

/**
 * Executado em caso de erro no WebSocket.
 * @param {Event} error
 */
function handleWebSocketError(error) {
    wsLogger.error("Erro WebSocket", error);
}

/**
 * Executado quando o WebSocket é fechado.
 * @param {CloseEvent} event
 */
function handleWebSocketClose(event) {
    wsLogger.warn("WebSocket fechado", { code: event.code, reason: event.reason });

    let sysMessage = "";
    let sysColor = null;

    // Código 4003 = sessão inválida (owner ou disconnect manual)
    if (event.code === 4003) {
        wsLogger.warn("Sessão invalidada pelo servidor - gerando nova sessão");
        sysMessage = "[SYSTEM] Invalid session. Click 'Login' to connect again.";
        sysColor = "orange";

        handleDisconnect("session_invalidated_4003");
        // Limpa publicId e token para forçar geração de novos
        StorageManager.clearSession();
        StateStore.setAllowReconnect(false);
        updateConnectionState("DISCONNECTED");
    } else if (StateStore.isManualDisconnect()) {
        sysMessage = "[SYSTEM] Disconnected";
        handleDisconnect("manual_disconnect");
        // Limpa sessão em desconexão manual
        StorageManager.clearSession();
        StateStore.setAllowReconnect(false);
        StateStore.setIsReconnecting(false);
        updateConnectionState("DISCONNECTED");
    } else {
        // Conexão perdida involuntariamente
        if (!StateStore.isReconnectAllowed()) {
            handleDisconnect("connection_lost_no_reconnect");
            updateConnectionState("DISCONNECTED");
            return;
        }

        handleDisconnect("connection_lost_reconnecting");
        if (reconnectAttempts === 0) {
            sysMessage = "[SYSTEM] Connection lost - trying to reconnect...";
        }
        updateConnectionState("RECONNECTING");
        scheduleReconnect();
    }

    if (sysMessage) UIHelpers.addSystemMessage(sysMessage, sysColor);
}
