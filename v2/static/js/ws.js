/**
 * ws.js (refatorado) - Gerenciamento WebSocket
 * Conexão e comunicação com o servidor
 */

const wsLogger = createLogger("ws");
const wsUrl = CONFIG.WS.url;

// Estado da conexão
let ws = null;
let lastCommandSent = "";
let reconnectAttempts = 0;
let reconnectTimeout = null;
const MAX_RECONNECT_ATTEMPTS = CONFIG.WS.reconnectMaxAttempts;
const RECONNECT_DELAY_MS = CONFIG.WS.reconnectDelayMs;

// Flags de reconexão e sessão ficam no StateStore

function buildMessage(type, payload = {}, meta = {}) {
    return {
        type,
        payload,
        meta: {
            ...(CONFIG.WS.messageMeta || {}),
            ...meta
        }
    };
}

function parseMessage(raw) {
    try {
        const data = JSON.parse(raw);
        const type = data.type;
        let payload = data.payload;
        const meta = data.meta || {};

        if (!payload) {
            payload = {};
            ["publicId", "owner", "value", "content", "message", "username", "password", "reason"].forEach(key => {
                if (data[key] !== undefined) {
                    payload[key] = data[key];
                }
            });
        }

        return { type, payload, meta };
    } catch (e) {
        wsLogger.error("Invalid WS message", e, raw);
        return null;
    }
}

function sendMessage(type, payload = {}, meta = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        wsLogger.error("Cannot send message - WebSocket not connected", type);
        return false;
    }

    ws.send(JSON.stringify(buildMessage(type, payload, {
        clientTs: Date.now(),
        ...meta
    })));
    return true;
}


/**
 * Cria e conecta o WebSocket
 */
function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        wsLogger.log("WebSocket already connected or connecting");
        return;
    }

    wsLogger.log("Creating WebSocket", wsUrl);
    ws = new WebSocket(wsUrl);

    // Handlers de eventos WebSocket
    ws.onopen = handleWebSocketOpen;
    ws.onmessage = handleWebSocketMessage;
    ws.onerror = handleWebSocketError;
    ws.onclose = handleWebSocketClose;
}

/**
 * Tenta reconectar após falha
 */
function scheduleReconnect() {
    if (StateStore.isManualDisconnect()) {
        wsLogger.log("Manual disconnect - not reconnecting");
        StateStore.setAllowReconnect(false);
        StateStore.setIsReconnecting(false);
        return;
    }

    if (!StateStore.isReconnectAllowed()) {
        wsLogger.log("Auto-reconnect not allowed - waiting for user action");
        StateStore.setIsReconnecting(false);
        return;
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        wsLogger.error("Max reconnect attempts reached");
        StateStore.setAllowReconnect(false);
        StateStore.setIsReconnecting(false);
        updateConnectionState("DISCONNECTED");
        UIHelpers.appendSystemMessage("[SISTEMA] Falha ao reconectar após várias tentativas. Clique em 'Login' para tentar novamente.", "red");
        return;
    }

    StateStore.setIsReconnecting(true);
    updateConnectionState("RECONNECTING");

    reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS;
    wsLogger.log(`Scheduling reconnect attempt ${reconnectAttempts} in ${delay}ms`);

    reconnectTimeout = setTimeout(() => {
        wsLogger.log(`Reconnect attempt ${reconnectAttempts}`);
        StateStore.setIsReconnecting(true);
        connectWebSocket();
    }, delay);
}

/**
 * Executado quando WebSocket abre
 */
function handleWebSocketOpen() {
    wsLogger.log("WebSocket opened");

    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    // Se conectou com sucesso, permitir reconexão automática em caso de queda
    if (!StateStore.isManualDisconnect()) {
        StateStore.setAllowReconnect(true);
    }

    // Obtém ou cria publicId e owner token
    const publicId = StorageManager.getOrCreatePublicId();
    const owner = StorageManager.getOwner();
    wsLogger.log("Initializing session", { publicId, hasToken: !!owner });

    // Envia mensagem de inicialização (com token se existir)
    sendMessage("init", {
        publicId: publicId,
        owner: owner || null
    });
}

/**
 * Executado quando mensagem é recebida
 */
function handleWebSocketMessage(event) {
    try {
        wsLogger.log("WebSocket message received", event.data);
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
            case "line":
                handleLineMessage(msg.payload || {});
                break;
            case "system":
                handleSystemMessage(msg.payload || {});
                break;
            case "error":
                handleErrorMessage(msg.payload || {});
                break;
            default:
                wsLogger.warn("Unknown message type", msg.type);
        }
    } catch (e) {
        wsLogger.error("Error processing message", e, event.data);
    }
}

/**
 * Executado em caso de erro WebSocket
 */
function handleWebSocketError(error) {
    wsLogger.error("WebSocket error", error);
}

/**
 * Executado quando WebSocket fecha
 */
function handleWebSocketClose(event) {
    wsLogger.warn("WebSocket closed", { code: event.code, reason: event.reason });

    let sysMessage = "";
    let sysColor = null;

    // Código 4003 = sessão inválida (owner ou manual disconnect)
    if (event.code === 4003) {
        wsLogger.warn("Session invalidated by server - generating new session");
        sysMessage = "[SISTEMA] Sessão inválida. Clique em 'Login' para conectar novamente.";
        sysColor = "orange";

        // Limpa publicId e token para forçar geração de novos
        StorageManager.clearSession();
        StateStore.setAllowReconnect(false);
        updateConnectionState("DISCONNECTED");
    } else if (StateStore.isManualDisconnect()) {
        sysMessage = "[SISTEMA] Desconectado";
        // Limpa sessão em desconexão manual
        StorageManager.clearSession();
        StateStore.setAllowReconnect(false);
        StateStore.setIsReconnecting(false);
        updateConnectionState("DISCONNECTED");
    } else {
        // Conexão perdida involuntariamente
        if (!StateStore.isReconnectAllowed()) {
            updateConnectionState("DISCONNECTED");
            return;
        }

        if (reconnectAttempts === 0) {
            sysMessage = "[SISTEMA] Conexão perdida - tentando reconectar...";
        }
        updateConnectionState("RECONNECTING");
        scheduleReconnect();
    }

    if (sysMessage) UIHelpers.appendSystemMessage(sysMessage, sysColor);
}

// ===== Message Handlers =====

function handleInitOkMessage(payload) {
    wsLogger.log("Session initialized", {
        publicId: payload.publicId,
        status: payload.status,
        hasHistory: payload.hasHistory
    });

    // Reseta contador de reconexão após conexão bem-sucedida
    reconnectAttempts = 0;

    // Salva o owner token recebido do servidor
    if (payload.owner) {
        StorageManager.setOwner(payload.owner);
        wsLogger.log("owner token saved");
    }

    // Marca sessão como inicializada após init_ok
    StateStore.setSessionInitialized(true);

    // Exibe feedback baseado no status
    if (payload.status === "created") {
        wsLogger.log("New session created");
    } else if (payload.status === "recovered") {
        wsLogger.log("Session recovered successfully");
        UIHelpers.appendSystemMessage("[SISTEMA] Sessão recuperada com sucesso!", "#4CAF50");
    }

    // Se há credenciais salvas, estamos reconectando
    const savedCredentials = StateStore.getSavedCredentials();
    if (savedCredentials && StateStore.isReconnecting()) {
        wsLogger.log("Detected reconnection with saved credentials - requesting connection");
        setTimeout(() => {
            sendMessage("connect");
        }, CONFIG.WS.backendReadyDelayMs);
    }

    // Se o usuário clicou em conectar antes do init_ok, envia connect agora
    if (StateStore.isConnectRequested() && !StateStore.isReconnecting()) {
        StateStore.setConnectRequested(false);
        wsLogger.log("Connect requested before init_ok - sending connect");
        setTimeout(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                sendMessage("connect");
            }
        }, CONFIG.WS.backendReadyDelayMs);
    }
}

function handleSessionInvalidMessage(payload) {
    wsLogger.error("Session invalidated by server", {
        reason: payload.reason,
        message: payload.message
    });

    UIHelpers.appendSystemMessage(`[SISTEMA] ${payload.message}`, "orange");

    // O WebSocket será fechado pelo servidor com código 4003
    // O handler onclose cuidará da limpeza e reconexão
}

function handleStateMessage(payload) {
    updateConnectionState(payload.value);
}

function handleErrorMessage(payload) {
    wsLogger.error("Server error", payload.message);
    UIHelpers.appendSystemMessage("[ERRO] " + payload.message, "red");
}

function handleHistoryMessage(payload) {
    UIHelpers.appendHistoryBlock(payload.content || "");

    if (payload.content && StateStore.isReconnecting()) {
        wsLogger.log("History received during reconnection - session active");
    }
}

function handleLineMessage(payload) {
    const output = getElement(CONFIG.SELECTORS.output);
    if (!output) return;

    if (!payload.content) return;

    // Tenta processar como parte de um menu interativo
    const isMenuLine = MenuManager.processLine(payload.content, output);

    // Se não for linha de menu, processa normalmente
    if (!isMenuLine) {
        UIHelpers.appendOutputLine(payload.content.trimEnd());
    }

    PromptDetector.setLastLine(payload.content);

    // Detecta quando o servidor está aguardando input/login
    const lineText = payload.content.toLowerCase();
    const hasInputPrompt = lineText.includes("[input]") ||
        lineText.includes("name:") ||
        lineText.includes("login:") ||
        lineText.includes("password:") ||
        lineText.includes("senha:");

    if (hasInputPrompt || lineText.includes("play") || lineText.includes("enter") ||
        (StateStore.getConnectionState() === "CONNECTED" && output && output.children.length > 3)) {
        checkAndShowLogin();
    }

    // Verifica se é um prompt de confirmação (apenas se não for menu)
    if (!isMenuLine && PromptDetector.shouldShowConfirmPrompt(payload.content)) {
        const promptMessage = PromptDetector.buildConfirmMessage(payload.content);
        showConfirmModal(promptMessage);
    }
}

function handleSystemMessage(payload) {
    UIHelpers.appendSystemMessage("[SISTEMA] " + payload.message);
}

// ===== Funkcionalidade: Dividir comandos por `;` =====

/**
 * Divide comandos separados por ;
 */
function splitCommands(commandText) {
    return commandText
        .split(";")
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0);
}

/**
 * Envia comando para o servidor
 */
function sendCommand(commandText) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        wsLogger.error("Cannot send command - WebSocket not connected");
        UIHelpers.appendSystemMessage("[SISTEMA] Não conectado - reconectando...", "orange");
        return;
    }

    const commands = splitCommands(commandText);
    for (const command of commands) {
        lastCommandSent = command;
        wsLogger.log("Sending command", command);
        sendMessage("command", { value: command });
    }
}

/**
 * Retorna último comando enviado
 */
function getLastCommandSent() {
    return lastCommandSent;
}

/**
 * Envia credenciais de login
 */
function sendLogin(username, password) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        wsLogger.error("Cannot send login - WebSocket not connected");
        return;
    }

    wsLogger.log("Sending login");
    sendMessage("login", {
        username: username,
        password: password
    });
}

/**
 * Cancela tentativa de reconexão
 */
function cancelReconnectAttempt() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    StateStore.setAllowReconnect(false);
    StateStore.setIsReconnecting(false);
    updateConnectionState("DISCONNECTED");

    if (ws && ws.readyState === WebSocket.CONNECTING) {
        ws.close();
    }

    UIHelpers.appendSystemMessage("[SISTEMA] Reconexão cancelada.", "orange");
}

