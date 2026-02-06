/**
 * ws.js (refatorado) - Gerenciamento WebSocket
 * Conexão e comunicação com o servidor
 */

const wsLogger = createLogger("ws");
const wsUrl = CONFIG.WS_URL;
wsLogger.log("Creating WebSocket", wsUrl);

// Flag para indicar reconexão
window.isReconnecting = false;

const ws = new WebSocket(wsUrl);
let lastCommandSent = "";

// Handlers de eventos WebSocket
ws.onopen = handleWebSocketOpen;
ws.onmessage = handleWebSocketMessage;
ws.onerror = handleWebSocketError;
ws.onclose = handleWebSocketClose;

/**
 * Executado quando WebSocket abre
 */
function handleWebSocketOpen() {
    wsLogger.log("WebSocket opened");

    // Se há credenciais salvas, estamos reconectando
    if (savedCredentials && window.isReconnecting) {
        wsLogger.log("Detected reconnection with saved credentials - requesting connection");
        setTimeout(() => {
            ws.send(JSON.stringify({ type: "connect" }));
        }, CONFIG.TIMEOUTS.backendReadyDelay);
    }
}

/**
 * Executado quando mensagem é recebida
 */
function handleWebSocketMessage(event) {
    try {
        wsLogger.log("WebSocket message received", event.data);
        const msg = JSON.parse(event.data);

        switch (msg.type) {
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
function handleWebSocketClose() {
    wsLogger.warn("WebSocket closed");

    const sysMsg = document.createElement("div");
    sysMsg.className = CONFIG.CLASSES.systemMessage;
    sysMsg.textContent = "[SISTEMA] Conexão com o servidor encerrada";
    const output = getElement(CONFIG.SELECTORS.output);
    if (output) output.appendChild(sysMsg);
}

// ===== Message Handlers =====

function handleStateMessage(msg) {
    updateConnectionState(msg.value);
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

    // Detecta quando o servidor está aguardando login
    const lineText = msg.content.toLowerCase();
    if (lineText.includes("play") || lineText.includes("enter") ||
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
    wsLogger.log("Sending login");
    ws.send(JSON.stringify({
        type: "login",
        username: username,
        password: password
    }));
}
