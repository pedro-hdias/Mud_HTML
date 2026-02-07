/**
 * ws.js (refatorado) - Gerenciamento WebSocket
 * Conexão e comunicação com o servidor
 */

const wsLogger = createLogger("ws");
const wsUrl = CONFIG.WS_URL;

// Estado da conexão
let ws = null;
let lastCommandSent = "";
let reconnectAttempts = 0;
let reconnectTimeout = null;
let isManualDisconnect = false;
let allowReconnect = false;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;

// Flag para indicar reconexão
window.isReconnecting = false;

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
    if (isManualDisconnect) {
        wsLogger.log("Manual disconnect - not reconnecting");
        allowReconnect = false;
        return;
    }

    if (!allowReconnect) {
        wsLogger.log("Auto-reconnect not allowed - waiting for user action");
        return;
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        wsLogger.error("Max reconnect attempts reached");
        allowReconnect = false;
        const sysMsg = document.createElement("div");
        sysMsg.className = CONFIG.CLASSES.systemMessage;
        sysMsg.style.color = "red";
        sysMsg.textContent = "[SISTEMA] Falha ao reconectar após várias tentativas. Clique em 'Login' para tentar novamente.";
        const output = getElement(CONFIG.SELECTORS.output);
        if (output) output.appendChild(sysMsg);
        return;
    }

    reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS;
    wsLogger.log(`Scheduling reconnect attempt ${reconnectAttempts} in ${delay}ms`);

    reconnectTimeout = setTimeout(() => {
        wsLogger.log(`Reconnect attempt ${reconnectAttempts}`);
        window.isReconnecting = true;
        connectWebSocket();
    }, delay);
}

/**
 * Executado quando WebSocket abre
 */
function handleWebSocketOpen() {
    wsLogger.log("WebSocket opened");

    // Reseta contador de reconexão
    reconnectAttempts = 0;
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    // Se conectou com sucesso, permitir reconexão automática em caso de queda
    if (!isManualDisconnect) {
        allowReconnect = true;
    }

    // Obtém ou cria publicId e owner token
    const publicId = StorageManager.getOrCreatePublicId();
    const owner = StorageManager.getOwner();
    wsLogger.log("Initializing session", { publicId, hasToken: !!owner });

    // Envia mensagem de inicialização (com token se existir)
    const initMsg = {
        type: "init",
        publicId: publicId
    };

    if (owner) {
        initMsg.owner = owner;
    }

    ws.send(JSON.stringify(initMsg));
}

/**
 * Executado quando mensagem é recebida
 */
function handleWebSocketMessage(event) {
    try {
        wsLogger.log("WebSocket message received", event.data);
        const msg = JSON.parse(event.data);

        switch (msg.type) {
            case "init_ok":
                handleInitOkMessage(msg);
                break;
            case "session_invalid":
                handleSessionInvalidMessage(msg);
                break;
            case "state":
                handleStateMessage(msg);
                break;
            case "history":
                handleHistoryMessage(msg);
                break;
            case "line":
                handleLineMessage(msg);
                break;
            case "system":
                handleSystemMessage(msg);
                break;
            case "error":
                handleErrorMessage(msg);
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

    const output = getElement(CONFIG.SELECTORS.output);
    const sysMsg = document.createElement("div");
    sysMsg.className = CONFIG.CLASSES.systemMessage;

    // Código 4003 = sessão inválida (owner ou manual disconnect)
    if (event.code === 4003) {
        wsLogger.warn("Session invalidated by server - generating new session");
        sysMsg.textContent = "[SISTEMA] Sessão inválida. Clique em 'Login' para conectar novamente.";
        sysMsg.style.color = "orange";

        // Limpa publicId e token para forçar geração de novos
        StorageManager.clearSession();
        allowReconnect = false;
        updateConnectionState("DISCONNECTED");
    } else if (isManualDisconnect) {
        sysMsg.textContent = "[SISTEMA] Desconectado";
        // Limpa sessão em desconexão manual
        StorageManager.clearSession();
        allowReconnect = false;
        updateConnectionState("DISCONNECTED");
    } else {
        // Conexão perdida involuntariamente
        if (reconnectAttempts === 0) {
            sysMsg.textContent = "[SISTEMA] Conexão perdida - tentando reconectar...";
        }
        scheduleReconnect();
    }

    if (output && sysMsg.textContent) {
        output.appendChild(sysMsg);
        output.scrollTop = output.scrollHeight;
    }
}

// ===== Message Handlers =====

function handleInitOkMessage(msg) {
    wsLogger.log("Session initialized", {
        publicId: msg.publicId,
        status: msg.status,
        hasHistory: msg.hasHistory
    });

    // Salva o owner token recebido do servidor
    if (msg.owner) {
        StorageManager.setOwner(msg.owner);
        wsLogger.log("owner token saved");
    }

    // Exibe feedback baseado no status
    if (msg.status === "created") {
        wsLogger.log("New session created");
    } else if (msg.status === "recovered") {
        wsLogger.log("Session recovered successfully");
        const sysMsg = document.createElement("div");
        sysMsg.className = CONFIG.CLASSES.systemMessage;
        sysMsg.textContent = "[SISTEMA] Sessão recuperada com sucesso!";
        sysMsg.style.color = "#4CAF50";
        const output = getElement(CONFIG.SELECTORS.output);
        if (output) output.appendChild(sysMsg);
    }

    // Se há credenciais salvas, estamos reconectando
    if (savedCredentials && window.isReconnecting) {
        wsLogger.log("Detected reconnection with saved credentials - requesting connection");
        setTimeout(() => {
            ws.send(JSON.stringify({ type: "connect" }));
        }, CONFIG.TIMEOUTS.backendReadyDelay);
    }
}

function handleSessionInvalidMessage(msg) {
    wsLogger.error("Session invalidated by server", {
        reason: msg.reason,
        message: msg.message
    });

    const sysMsg = document.createElement("div");
    sysMsg.className = CONFIG.CLASSES.systemMessage;
    sysMsg.style.color = "orange";
    sysMsg.textContent = `[SISTEMA] ${msg.message}`;

    const output = getElement(CONFIG.SELECTORS.output);
    if (output) {
        output.appendChild(sysMsg);
        output.scrollTop = output.scrollHeight;
    }

    // O WebSocket será fechado pelo servidor com código 4003
    // O handler onclose cuidará da limpeza e reconexão
}

function handleStateMessage(msg) {
    updateConnectionState(msg.value);
}

function handleErrorMessage(msg) {
    wsLogger.error("Server error", msg.message);
    const sysMsg = document.createElement("div");
    sysMsg.className = CONFIG.CLASSES.systemMessage;
    sysMsg.style.color = "red";
    sysMsg.textContent = "[ERRO] " + msg.message;
    const output = getElement(CONFIG.SELECTORS.output);
    if (output) {
        output.appendChild(sysMsg);
        output.scrollTop = output.scrollHeight;
    }
}

function handleHistoryMessage(msg) {
    const historyContainer = document.createElement("div");
    historyContainer.className = CONFIG.CLASSES.historyBlock;

    const lines = msg.content.split(/\r?\n/);
    lines.forEach((line, idx) => {
        if (line || idx < lines.length - 1) {
            const lineEl = document.createElement("div");
            lineEl.className = `${CONFIG.CLASSES.outputLine} ${CONFIG.CLASSES.history}`;
            lineEl.textContent = line;
            historyContainer.appendChild(lineEl);
        }
    });

    const output = getElement(CONFIG.SELECTORS.output);
    if (output) {
        output.appendChild(historyContainer);
        output.scrollTop = output.scrollHeight;
    }

    if (msg.content && window.isReconnecting) {
        wsLogger.log("History received during reconnection - session active");
    }
}

function handleLineMessage(msg) {
    const output = getElement(CONFIG.SELECTORS.output);
    if (!output) return;

    // Tenta processar como parte de um menu interativo
    const isMenuLine = MenuManager.processLine(msg.content, output);

    // Se não for linha de menu, processa normalmente
    if (!isMenuLine) {
        const lineEl = document.createElement("div");
        lineEl.className = `${CONFIG.CLASSES.outputLine} ${CONFIG.CLASSES.new}`;
        lineEl.textContent = msg.content.trimEnd();
        output.appendChild(lineEl);
        output.scrollTop = output.scrollHeight;
    }

    PromptDetector.setLastLine(msg.content);

    // Detecta quando o servidor está aguardando input/login
    const lineText = msg.content.toLowerCase();
    const hasInputPrompt = lineText.includes("[input]") ||
        lineText.includes("name:") ||
        lineText.includes("login:") ||
        lineText.includes("password:") ||
        lineText.includes("senha:");

    if (hasInputPrompt || lineText.includes("play") || lineText.includes("enter") ||
        (currentState === "CONNECTED" && output && output.children.length > 3)) {
        checkAndShowLogin();
    }

    // Verifica se é um prompt de confirmação (apenas se não for menu)
    if (!isMenuLine && PromptDetector.shouldShowConfirmPrompt(msg.content)) {
        const promptMessage = PromptDetector.buildConfirmMessage(msg.content);
        showConfirmModal(promptMessage);
    }
}

function handleSystemMessage(msg) {
    const sysMsg = document.createElement("div");
    sysMsg.className = CONFIG.CLASSES.systemMessage;
    sysMsg.textContent = "[SISTEMA] " + msg.message;
    const output = getElement(CONFIG.SELECTORS.output);
    if (output) {
        output.appendChild(sysMsg);
        output.scrollTop = output.scrollHeight;
    }
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
        const sysMsg = document.createElement("div");
        sysMsg.className = CONFIG.CLASSES.systemMessage;
        sysMsg.style.color = "orange";
        sysMsg.textContent = "[SISTEMA] Não conectado - reconectando...";
        const output = getElement(CONFIG.SELECTORS.output);
        if (output) output.appendChild(sysMsg);
        return;
    }

    const commands = splitCommands(commandText);
    for (const command of commands) {
        lastCommandSent = command;
        wsLogger.log("Sending command", command);
        ws.send(JSON.stringify({
            type: "command",
            value: command
        }));
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
    ws.send(JSON.stringify({
        type: "login",
        username: username,
        password: password
    }));
}

