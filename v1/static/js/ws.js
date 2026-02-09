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
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 2000;

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
        return;
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        wsLogger.error("Max reconnect attempts reached");
        const sysMsg = document.createElement("div");
        sysMsg.className = CONFIG.CLASSES.systemMessage;
        sysMsg.style.color = "red";
        sysMsg.textContent = "[SISTEMA] Falha ao reconectar após várias tentativas. Recarregue a página.";
        const output = getElement(CONFIG.SELECTORS.output);
        if (output) output.appendChild(sysMsg);
        return;
    }

    reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * reconnectAttempts;
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

    // Obtém ou cria sessionId
    const sessionId = StorageManager.getOrCreateSessionId();
    wsLogger.log("Initializing session", { sessionId });

    // Envia mensagem de inicialização
    ws.send(JSON.stringify({
        type: "init",
        sessionId: sessionId
    }));
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

    const sysMsg = document.createElement("div");
    sysMsg.className = CONFIG.CLASSES.systemMessage;

    if (isManualDisconnect) {
        sysMsg.textContent = "[SISTEMA] Desconectado";
    } else {
        sysMsg.textContent = "[SISTEMA] Conexão perdida - tentando reconectar...";
        scheduleReconnect();
    }

    const output = getElement(CONFIG.SELECTORS.output);
    if (output) {
        output.appendChild(sysMsg);
        output.scrollTop = output.scrollHeight;
    }
}

// ===== Message Handlers =====

function handleInitOkMessage(msg) {
    wsLogger.log("Session initialized", { sessionId: msg.sessionId });

    // Se há credenciais salvas, estamos reconectando
    if (savedCredentials && window.isReconnecting) {
        wsLogger.log("Detected reconnection with saved credentials - requesting connection");
        setTimeout(() => {
            ws.send(JSON.stringify({ type: "connect" }));
        }, CONFIG.TIMEOUTS.backendReadyDelay);
    }
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

// Inicializa WebSocket quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        wsLogger.log("DOM ready - initializing WebSocket");
        connectWebSocket();
    });
} else {
    wsLogger.log("DOM already loaded - initializing WebSocket");
    connectWebSocket();
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
