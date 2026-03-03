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
const RECONNECT_BASE_DELAY_MS = CONFIG.WS.reconnectBaseDelayMs;
const RECONNECT_MAX_DELAY_MS = CONFIG.WS.reconnectMaxDelayMs;

// Fila de comandos pendentes (enviados durante reconexão)
let pendingCommandQueue = [];

// Fila de saída (sem delay, envia direto)
let _outgoingQueue = [];

// Idempotency guard for disconnect cleanup
let _disconnectGuard = false;

// Padrões para detectar quando o jogador está em-jogo
const IN_GAME_PATTERNS = [
    /^obvious exits?:/i,
    /^exits?:\s/i,
    /you (?:are in|go |enter |leave |arrive)/i,
    /^\[hp:/i,
];

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

// UX: Latência — timestamp do último envio para medir round-trip
let _lastSendTimestamp = 0;

// ===== Outgoing command queue (no delay, sends immediately) =====

function _processQueuedCommands() {
    while (_outgoingQueue.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
        const cmd = _outgoingQueue.shift();
        lastCommandSent = cmd;
        sendMessage("command", { value: cmd });
        wsLogger.debug("Sent queued command", cmd, `(${_outgoingQueue.length} remaining)`);
    }
}

function _stopOutgoingQueue() {
    _outgoingQueue = [];
}

// ===== Single authoritative disconnect handler =====

/**
 * Handles disconnect cleanup exactly once (idempotent).
 * @param {string} reason - Reason for disconnection
 */
function handleDisconnect(reason) {
    if (_disconnectGuard) {
        wsLogger.debug("Disconnect already handled, skipping:", reason);
        return;
    }
    _disconnectGuard = true;
    wsLogger.log("Handling disconnect:", reason);

    // Stop outgoing queue
    _stopOutgoingQueue();

    // Reset menu state
    if (typeof MenuManager !== "undefined") MenuManager.reset();
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
        UIHelpers.addSystemMessage("[SYSTEM] Failed to reconnect after multiple attempts. Click 'Login' to try again.", "red");
        return;
    }

    StateStore.setIsReconnecting(true);
    updateConnectionState("RECONNECTING");

    reconnectAttempts++;
    // Exponential backoff com jitter: base * 2^(attempt-1) + random jitter
    const expDelay = Math.min(
        RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts - 1),
        RECONNECT_MAX_DELAY_MS
    );
    const jitter = Math.floor(Math.random() * 1000);
    const delay = expDelay + jitter;
    wsLogger.log(`Scheduling reconnect attempt ${reconnectAttempts} in ${delay}ms (base: ${expDelay}, jitter: ${jitter})`);

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

    // Reset disconnect guard so cleanup can run on next disconnect
    _disconnectGuard = false;

    if (window.SoundInterceptor && typeof window.SoundInterceptor.init === "function") {
        window.SoundInterceptor.init();
    }

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
    _lastSendTimestamp = Date.now();
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
        wsLogger.debug("WebSocket message received", event.data);
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

// ===== Message Handlers =====

function handleInitOkMessage(payload) {
    wsLogger.log("Session initialized", {
        publicId: payload.publicId,
        status: payload.status,
        hasHistory: payload.hasHistory
    });

    // Mede latência round-trip (init -> init_ok)
    if (_lastSendTimestamp > 0) {
        const latency = Date.now() - _lastSendTimestamp;
        _lastSendTimestamp = 0;
        wsLogger.log("Latency (round-trip)", latency, "ms");
        UIHelpers.showLatency(latency);
    }

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
        UIHelpers.addSystemMessage("[SYSTEM] Session recovered successfully!", "#4CAF50");
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

    UIHelpers.addSystemMessage(`[SYSTEM] ${payload.message}`, "orange");

    // O WebSocket será fechado pelo servidor com código 4003
    // O handler onclose cuidará da limpeza e reconexão
}

function handleSoundMessage(payload) {
    if (!payload.events || !Array.isArray(payload.events)) {
        wsLogger.warn("Invalid sound payload", payload);
        return;
    }

    if (window.SoundHandler && typeof window.SoundHandler.handleSoundEvents === "function") {
        window.SoundHandler.handleSoundEvents(payload.events);
    } else {
        wsLogger.warn("SoundHandler not available");
    }
}

function handleStateMessage(payload) {
    const previousState = StateStore.getConnectionState();

    // Only call handleDisconnect if transitioning FROM a connected state TO disconnected
    // Don't call it for status updates or initial state reports
    if (payload.value === "DISCONNECTED" && previousState !== "DISCONNECTED" && StateStore.isSessionInitialized()) {
        handleDisconnect("state_message_disconnected");
    }

    updateConnectionState(payload.value);
}

function handleErrorMessage(payload) {
    wsLogger.error("Server error", payload.message);
    UIHelpers.addSystemMessage("[ERROR] " + payload.message, "red");
}

function handleHistoryMessage(payload) {
    const isRecent = payload.is_recent || false;
    const hasMoreHistory = payload.has_more_history || false || CONFIG.DEBUG_FORCE_HISTORY_BUTTON;

    wsLogger.log(`📜 History received:`, {
        isRecent,
        hasMoreHistory,
        contentLength: (payload.content || '').length,
        contentLines: (payload.content || '').split('\n').length
    });

    if (isRecent) {
        // Histórico recente: renderizar normalmente sem compactar
        UIHelpers.appendHistoryBlock(payload.content || "", { isRecent: true });

        // Se houver mais histórico, mostrar loader sob demanda
        if (hasMoreHistory) {
            wsLogger.log("✅ Creating history loader (hasMoreHistory === true)");
            const output = getElement(CONFIG.SELECTORS.output);
            if (output) {
                const loader = UIHelpers.ensureHistoryLoader(output);
                wsLogger.log("📦 History loader element:", loader);
                wsLogger.log("📍 Loader is in DOM:", document.contains(loader));
                wsLogger.log("👁️ Loader visibility:", window.getComputedStyle(loader).display);
                wsLogger.log("📏 Loader position:", loader.getBoundingClientRect());
                wsLogger.log("🔍 Output scroll:", { scrollTop: output.scrollTop, scrollHeight: output.scrollHeight, clientHeight: output.clientHeight });
                UIHelpers.updateHistoryLoaderState(output, true, 25);
            } else {
                wsLogger.error("❌ Output element not found!");
            }
        } else {
            wsLogger.log("⚠️ No more history available (hasMoreHistory === false), skipping loader");
        }
    } else {
        // Histórico sob demanda: adicionar ao loader
        const output = getElement(CONFIG.SELECTORS.output);
        if (output) {
            UIHelpers.appendHistoryToLoader(output, payload.content || "");
            UIHelpers.updateHistoryLoaderState(output, payload.has_more_history || false, payload.from_line_index || 0);
        }
    }

    if (payload.content && StateStore.isReconnecting()) {
        wsLogger.log("History received during reconnection - session active");
    }
}

function handleHistorySliceMessage(payload) {
    wsLogger.log(`📜 History slice received:`, {
        contentLength: (payload.content || '').length,
        contentLines: (payload.content || '').split('\n').filter(l => l).length,
        hasMore: payload.has_more,
        fromLineIndex: payload.from_line_index
    });

    // Histórico sob demanda é sempre processado como não-recente
    const output = getElement(CONFIG.SELECTORS.output);
    if (output) {
        UIHelpers.appendHistoryToLoader(output, payload.content || "");
        UIHelpers.updateHistoryLoaderState(output, payload.has_more || false, payload.from_line_index || 0);
    }
}

function handleLineMessage(payload) {
    const output = getElement(CONFIG.SELECTORS.output);
    if (!output) return;

    if (!payload.content) return;

    UIHelpers.appendOutputLine(payload.content.trimEnd());

    PromptDetector.setLastLine(payload.content);

    if (window.SoundInterceptor && typeof window.SoundInterceptor.handleLine === "function") {
        window.SoundInterceptor.handleLine(payload.content);
    }

    // Detecta quando o servidor está aguardando input/login
    const lineText = payload.content.toLowerCase();
    const hasInputPrompt = lineText.includes("[input]") ||
        lineText.includes("name:") ||
        lineText.includes("login:") ||
        lineText.includes("password:") ||
        lineText.includes("senha:");

    // Apenas chama checkAndShowLogin se detectar explicitamente um prompt de entrada
    if (hasInputPrompt) {
        checkAndShowLogin();
    }

    // Detect in-game signals to transition session phase
    detectSessionPhaseFromLine(payload.content);

    // Verifica se é um prompt de confirmação
    if (PromptDetector.shouldShowConfirmPrompt(payload.content)) {
        const promptMessage = PromptDetector.buildConfirmMessage(payload.content);
        showConfirmModal(promptMessage);
    }
}

function handleMenuMessage(payload) {
    const output = getElement(CONFIG.SELECTORS.output);
    if (!output) return;

    if (!payload || !Array.isArray(payload.options) || payload.options.length === 0) {
        wsLogger.warn("Invalid menu payload", payload);
        return;
    }

    if (typeof MenuManager !== "undefined" && typeof MenuManager.renderBackendMenu === "function") {
        MenuManager.renderBackendMenu(payload, output);
    } else {
        wsLogger.warn("MenuManager not available for backend menu payload");
    }
}

/**
 * Detects session phase transitions from incoming MUD text lines.
 * Transitions to IN_GAME when room/movement signals are detected.
 * @param {string} line - Incoming line from MUD server
 */
function detectSessionPhaseFromLine(line) {
    const phase = StateStore.getSessionPhase();
    if (phase === "IN_GAME") return; // already in-game, no need to check

    if (IN_GAME_PATTERNS.some(p => p.test(line.trim()))) {
        transitionToPhase("IN_GAME", "in_game_signal");
    }
}

function handleSystemMessage(payload) {
    UIHelpers.addSystemMessage("[SYSTEM] " + payload.message);
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
 * Envia comando para o servidor sem delay.
 * Single commands and macros are sent immediately.
 */
function sendCommand(commandText) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        // Se estamos reconectando, enfileira o comando
        if (StateStore.isReconnecting() && pendingCommandQueue.length < CONFIG.COMMAND_QUEUE_MAX) {
            pendingCommandQueue.push(commandText);
            wsLogger.log("Command queued during reconnect", commandText, `(${pendingCommandQueue.length} in queue)`);
            UIHelpers.addSystemMessage(`[SYSTEM] Command queued (reconnecting...) [${pendingCommandQueue.length}/${CONFIG.COMMAND_QUEUE_MAX}]`, "#888");
            return;
        }
        wsLogger.error("Cannot send command - WebSocket not connected");
        UIHelpers.addSystemMessage("[SYSTEM] Not connected - reconnecting...", "orange");
        return;
    }

    const commands = splitCommands(commandText);
    if (commands.length === 0) return;

    if (commands.length === 1) {
        // Single command: send directly (low latency)
        lastCommandSent = commands[0];
        wsLogger.log("Sending command", commands[0]);
        sendMessage("command", { value: commands[0] });
        return;
    }

    // Multiple commands (macro): send each directly without delay
    wsLogger.log(`Sending macro: count=${commands.length}`);
    commands.forEach(cmd => {
        lastCommandSent = cmd;
        sendMessage("command", { value: cmd });
        wsLogger.debug("Sent macro command", cmd);
    });
}

/**
 * Envia comandos pendentes da fila
 */
function flushPendingCommands() {
    if (pendingCommandQueue.length === 0) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    wsLogger.log(`Flushing ${pendingCommandQueue.length} pending commands`);
    const queued = [...pendingCommandQueue];
    pendingCommandQueue = [];

    for (const cmd of queued) {
        sendCommand(cmd);
    }

    if (queued.length > 0) {
        UIHelpers.addSystemMessage(`[SYSTEM] ${queued.length} queued command(s) sent.`, "#4CAF50");
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
    // Transition to AUTH_IN_PROGRESS immediately - deactivates any stale menu
    transitionToPhase("AUTH_IN_PROGRESS", "login_sent");
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

    UIHelpers.addSystemMessage("[SYSTEM] Reconnection cancelled.", "orange");
}

