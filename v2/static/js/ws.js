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
let connectRequested = false;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;

// Flag para indicar reconexão
window.isReconnecting = false;

// Flag para indicar que a sessão foi inicializada (init_ok recebido)
window.sessionInitialized = false;

const OUTPUT_MAX_LINES = 2000;

function appendSystemMessage(message, color) {
    const output = getElement(CONFIG.SELECTORS.output);
    if (!output) return;

    const sysMsg = document.createElement("div");
    sysMsg.className = CONFIG.CLASSES.systemMessage;
    if (color) sysMsg.style.color = color;
    sysMsg.textContent = message;
    output.appendChild(sysMsg);
    trimOutputLines(output, OUTPUT_MAX_LINES);
    output.scrollTop = output.scrollHeight;
}

function trimOutputLines(output, maxLines) {
    if (!output) return;
    let totalLines = output.children.length;
    if (totalLines <= maxLines) return;

    const toRemove = totalLines - maxLines;
    for (let i = 0; i < toRemove; i++) {
        if (output.firstChild) {
            output.removeChild(output.firstChild);
        }
    }
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
        appendSystemMessage("[SISTEMA] Falha ao reconectar após várias tentativas. Clique em 'Login' para tentar novamente.", "red");
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
    let sysMessage = "";
    let sysColor = null;

    // Código 4003 = sessão inválida (owner ou manual disconnect)
    if (event.code === 4003) {
        wsLogger.warn("Session invalidated by server - generating new session");
        sysMessage = "[SISTEMA] Sessão inválida. Clique em 'Login' para conectar novamente.";
        sysColor = "orange";

        // Limpa publicId e token para forçar geração de novos
        StorageManager.clearSession();
        allowReconnect = false;
        updateConnectionState("DISCONNECTED");
    } else if (isManualDisconnect) {
        sysMessage = "[SISTEMA] Desconectado";
        // Limpa sessão em desconexão manual
        StorageManager.clearSession();
        allowReconnect = false;
        updateConnectionState("DISCONNECTED");
    } else {
        // Conexão perdida involuntariamente
        if (reconnectAttempts === 0) {
            sysMessage = "[SISTEMA] Conexão perdida - tentando reconectar...";
        }
        scheduleReconnect();
    }

    if (sysMessage) appendSystemMessage(sysMessage, sysColor);
}

// ===== Message Handlers =====

function handleInitOkMessage(msg) {
    wsLogger.log("Session initialized", {
        publicId: msg.publicId,
        status: msg.status,
        hasHistory: msg.hasHistory
    });

    // Reseta contador de reconexão após conexão bem-sucedida
    reconnectAttempts = 0;

    // Salva o owner token recebido do servidor
    if (msg.owner) {
        StorageManager.setOwner(msg.owner);
        wsLogger.log("owner token saved");
    }

    // Marca sessão como inicializada após init_ok
    window.sessionInitialized = true;

    // Exibe feedback baseado no status
    if (msg.status === "created") {
        wsLogger.log("New session created");
    } else if (msg.status === "recovered") {
        wsLogger.log("Session recovered successfully");
        appendSystemMessage("[SISTEMA] Sessão recuperada com sucesso!", "#4CAF50");
    }

    // Se há credenciais salvas, estamos reconectando
    if (savedCredentials && window.isReconnecting) {
        wsLogger.log("Detected reconnection with saved credentials - requesting connection");
        setTimeout(() => {
            ws.send(JSON.stringify({ type: "connect" }));
        }, CONFIG.TIMEOUTS.backendReadyDelay);
    }

    // Se o usuário clicou em conectar antes do init_ok, envia connect agora
    if (connectRequested && !window.isReconnecting) {
        connectRequested = false;
        wsLogger.log("Connect requested before init_ok - sending connect");
        setTimeout(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "connect" }));
            }
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
    appendSystemMessage("[ERRO] " + msg.message, "red");
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
        trimOutputLines(output, OUTPUT_MAX_LINES);
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
        trimOutputLines(output, OUTPUT_MAX_LINES);
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
    appendSystemMessage("[SISTEMA] " + msg.message);
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
        appendSystemMessage("[SISTEMA] Não conectado - reconectando...", "orange");
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

