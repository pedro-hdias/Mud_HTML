/**
 * ws/handlers.js - Handlers de mensagens recebidas do servidor
 * Processa cada tipo de mensagem enviado pelo backend MUD.
 */

// Padrões para detectar quando o jogador está em-jogo
const IN_GAME_PATTERNS = [
    /^obvious exits?:/i,
    /^exits?:\s/i,
    /you (?:are in|go |enter |leave |arrive)/i,
    /you can go\b/i,
    /^\[".+";.+\]$/i,
    /^\[hp:/i,
];

/**
 * Trata mensagem init_ok — sessão inicializada com sucesso.
 * @param {Object} payload
 */
function handleInitOkMessage(payload) {
    wsLogger.log("Sessão inicializada", {
        publicId: payload.publicId,
        status: payload.status,
        hasHistory: payload.hasHistory
    });

    // Mede latência round-trip (init -> init_ok)
    if (_lastSendTimestamp > 0) {
        const latency = Date.now() - _lastSendTimestamp;
        _lastSendTimestamp = 0;
        wsLogger.log("Latência (round-trip)", latency, "ms");
        UIHelpers.showLatency(latency);
    }

    // Reseta contador de reconexão após conexão bem-sucedida
    reconnectAttempts = 0;

    // Salva o owner token recebido do servidor
    if (payload.owner) {
        StorageManager.setOwner(payload.owner);
        wsLogger.log("Token owner salvo");
    }

    // Marca sessão como inicializada após init_ok
    StateStore.setSessionInitialized(true);

    // Exibe feedback baseado no status
    if (payload.status === "created") {
        wsLogger.log("Nova sessão criada");
    } else if (payload.status === "recovered") {
        wsLogger.log("Sessão recuperada com sucesso");
        UIHelpers.addSystemMessage("[SYSTEM] Session recovered successfully!", "#4CAF50");
    }

    // Se há credenciais salvas, estamos reconectando
    const savedCredentials = StateStore.getSavedCredentials();
    if (savedCredentials && StateStore.isReconnecting()) {
        wsLogger.log("Reconexão com credenciais salvas detectada - solicitando conexão");
        setTimeout(() => {
            sendMessage("connect");
        }, CONFIG.WS.backendReadyDelayMs);
    }

    // Se o usuário clicou em conectar antes do init_ok, envia connect agora
    if (StateStore.isConnectRequested() && !StateStore.isReconnecting()) {
        StateStore.setConnectRequested(false);
        wsLogger.log("Connect solicitado antes do init_ok - enviando connect");
        setTimeout(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                sendMessage("connect");
            }
        }, CONFIG.WS.backendReadyDelayMs);
    }

    // Garante que o loader de histórico existe no output, mesmo sem histórico ainda.
    // Só cria em estado desabilitado se o loader ainda não foi configurado pela mensagem de histórico.
    const output = getElement(CONFIG.SELECTORS.output);
    if (output) {
        const existingLoader = output.querySelector('.history-loader');
        if (!existingLoader || existingLoader.dataset.hasMore !== 'true') {
            UIHelpers.ensureHistoryLoader(output);
            UIHelpers.updateHistoryLoaderState(output, false, 0);
        }
    }
}

/**
 * Trata mensagem session_invalid — sessão inválida pelo servidor.
 * @param {Object} payload
 */
function handleSessionInvalidMessage(payload) {
    wsLogger.error("Sessão invalidada pelo servidor", {
        reason: payload.reason,
        message: payload.message
    });

    UIHelpers.addSystemMessage(`[SYSTEM] ${payload.message}`, "orange");

    // O WebSocket será fechado pelo servidor com código 4003
    // O handler onclose cuidará da limpeza e reconexão
}

/**
 * Trata mensagem sound — eventos de som.
 * @param {Object} payload
 */
function handleSoundMessage(payload) {
    if (!payload.events || !Array.isArray(payload.events)) {
        wsLogger.warn("Payload de som inválido", payload);
        return;
    }

    if (window.SoundHandler && typeof window.SoundHandler.handleSoundEvents === "function") {
        window.SoundHandler.handleSoundEvents(payload.events);
    } else {
        wsLogger.warn("SoundHandler não disponível");
    }
}

/**
 * Trata mensagem state — mudança de estado da conexão.
 * @param {Object} payload
 */
function handleStateMessage(payload) {
    const previousState = StateStore.getConnectionState();

    // Chama handleDisconnect apenas ao transitar DE um estado conectado PARA desconectado
    if (payload.value === "DISCONNECTED" && previousState !== "DISCONNECTED" && StateStore.isSessionInitialized()) {
        handleDisconnect("state_message_disconnected");
    }

    updateConnectionState(payload.value);
}

/**
 * Trata mensagem error — erro do servidor.
 * @param {Object} payload
 */
function handleErrorMessage(payload) {
    wsLogger.error("Erro do servidor", payload.message);
    UIHelpers.addSystemMessage("[ERROR] " + payload.message, "red");
}

/**
 * Trata mensagem history — histórico de linhas da sessão.
 * @param {Object} payload
 */
function handleHistoryMessage(payload) {
    const isRecent = payload.is_recent || false;
    const totalLines = parseInt(payload.total_lines || "0", 10);
    const returnedLines = parseInt(payload.returned_lines || "0", 10);
    const hasMoreHistory = (payload.has_more_history || false || CONFIG.DEBUG_FORCE_HISTORY_BUTTON);

    wsLogger.debug(`📜 Histórico recebido:`, {
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
            wsLogger.debug("✅ Criando history loader (hasMoreHistory === true)");
            const output = getElement(CONFIG.SELECTORS.output);
            if (output) {
                const loader = UIHelpers.ensureHistoryLoader(output);
                loader.dataset.totalLines = String(totalLines);
                wsLogger.debug("📦 Elemento history loader:", loader);
                wsLogger.debug("📍 Loader no DOM:", document.contains(loader));
                wsLogger.debug("👁️ Visibilidade do loader:", window.getComputedStyle(loader).display);
                wsLogger.debug("📏 Posição do loader:", loader.getBoundingClientRect());
                wsLogger.debug("🔍 Scroll do output:", { scrollTop: output.scrollTop, scrollHeight: output.scrollHeight, clientHeight: output.clientHeight });
                UIHelpers.updateHistoryLoaderState(output, hasMoreHistory, returnedLines || (CONFIG.HISTORY_REQUEST?.DEFAULT ?? 50));
            } else {
                wsLogger.error("❌ Elemento output não encontrado!");
            }
        } else {
            wsLogger.debug("⚠️ Sem mais histórico (hasMoreHistory === false), ignorando loader");
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
        wsLogger.log("Histórico recebido durante reconexão - sessão ativa");
    }
}

/**
 * Trata mensagem history_slice — fatia de histórico sob demanda.
 * @param {Object} payload
 */
function handleHistorySliceMessage(payload) {
    wsLogger.log(`📜 Fatia de histórico recebida:`, {
        contentLength: (payload.content || '').length,
        contentLines: (payload.content || '').split('\n').filter(l => l).length,
        hasMore: payload.has_more,
        fromLineIndex: payload.from_line_index
    });

    // Histórico sob demanda é sempre processado como não-recente
    const output = getElement(CONFIG.SELECTORS.output);
    if (output) {
        const loader = UIHelpers.ensureHistoryLoader(output);
        if (loader) {
            loader.dataset.totalLines = String(payload.total_lines || 0);
        }
        UIHelpers.appendHistoryToLoader(output, payload.content || "");
        UIHelpers.updateHistoryLoaderState(output, payload.has_more || false, payload.from_line_index || 0);
    }
}

/**
 * Trata mensagem line — linha de texto do jogo.
 * @param {Object} payload
 */
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
    const lineTextClean = lineText.replace(/\x1b\[[0-9;]*m/g, "").trimEnd();
    const hasInputPrompt = lineTextClean.includes("[input]") ||
        /\b(?:username|user\s*name|name|login)\s*:\s*$/i.test(lineTextClean);

    // Apenas chama checkAndShowLogin se detectar explicitamente um prompt de entrada
    if (hasInputPrompt) {
        checkAndShowLogin();
    }

    // Ativa entrada segura (tipo password) quando o servidor solicita senha.
    const hasPasswordPrompt = /(?:^|\b)(?:password|senha|passwd)\s*[:?]\s*$/i.test(lineTextClean) ||
        /(?:enter|type|digite|informe).*(?:password|senha|passwd)\s*[:?]?\s*$/i.test(lineTextClean);
    if (hasPasswordPrompt) {
        UIHelpers.setInputSecure(true);
    } else if (hasInputPrompt) {
        UIHelpers.setInputSecure(false);
    }

    // Detecta sinais de jogo para transicionar a fase da sessão
    detectSessionPhaseFromLine(payload.content);

    // Verifica se é um prompt de confirmação
    if (PromptDetector.shouldShowConfirmPrompt(payload.content)) {
        const promptMessage = PromptDetector.buildConfirmMessage(payload.content);
        showConfirmModal(promptMessage);
    }
}

/**
 * Trata mensagem menu — menu interativo do backend.
 * @param {Object} payload
 */
function handleMenuMessage(payload) {
    const output = getElement(CONFIG.SELECTORS.output);
    if (!output) return;

    if (!payload || !Array.isArray(payload.options) || payload.options.length === 0) {
        wsLogger.warn("Payload de menu inválido", payload);
        return;
    }

    if (typeof MenuManager !== "undefined" && typeof MenuManager.renderBackendMenu === "function") {
        MenuManager.renderBackendMenu(payload, output);
    } else {
        wsLogger.warn("MenuManager não disponível para payload de menu do backend");
    }
}

/**
 * Trata mensagem system — mensagem de sistema.
 * @param {Object} payload
 */
function handleSystemMessage(payload) {
    UIHelpers.addSystemMessage("[SYSTEM] " + payload.message);
}

/**
 * Detecta transições de fase da sessão a partir de linhas de texto do MUD.
 * Transiciona para IN_GAME quando sinais de sala/movimento são detectados.
 * @param {string} line - Linha recebida do servidor MUD
 */
function detectSessionPhaseFromLine(line) {
    const phase = StateStore.getSessionPhase();
    if (phase === "IN_GAME") return; // já em jogo, sem necessidade de verificar

    if (IN_GAME_PATTERNS.some(p => p.test(line.trim()))) {
        transitionToPhase("IN_GAME", "in_game_signal");
    }
}
