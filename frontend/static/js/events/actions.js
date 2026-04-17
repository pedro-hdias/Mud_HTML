/**
 * events/actions.js - Handlers de ações do usuário
 * Contém: handleLoginClick, handleDisconnectClick, handleCancelReconnectClick,
 * handleClearClick, handleSendClick, handleLoginSubmit, sendConfirmYes, sendConfirmNo,
 * requestOlderHistory.
 * Mesclados em EventManager via Object.assign em events/bindings.js.
 * Depende de: config.js, state/store.js, state/persistence.js, ui/index.js (UIHelpers),
 *             modals.js (ModalManager), ws/client.js (sendCommand, sendLogin, sendMessage),
 *             events/keyboard.js (eventsLogger)
 */

const _EventActionsMethods = {
    handleLoginClick() {
        eventsLogger.log("Login button clicked - initiating connection");

        // Reseta flags de desconexão manual ao tentar conectar
        StateStore.setManualDisconnect(false);
        StateStore.setAllowReconnect(true);

        // Marca que o usuário solicitou conexão (usado após init_ok)
        StateStore.setConnectRequested(true);

        // Reseta flag de dismissal do modal para nova conexão
        ModalManager.resetLoginModalDismissal();

        StateStore.setAllowLoginPrompt(true);
        StateStore.setLoginShown(false);
        StateStore.setLoginModalScheduled(false);
        StateManager.saveLoginState();

        if (typeof ws !== 'undefined' && ws !== null && ws.readyState === WebSocket.OPEN) {
            sendMessage("connect");
        } else if (typeof ws !== 'undefined' && ws !== null && ws.readyState === WebSocket.CONNECTING) {
            eventsLogger.log("WebSocket is connecting, waiting for connection");
        } else {
            eventsLogger.log("WebSocket not connected - establishing connection");
            if (typeof connectWebSocket === 'function') {
                connectWebSocket();
            }
        }
    },

    handleDisconnectClick() {
        eventsLogger.log("Disconnect button clicked - closing connection");

        // Marca como desconexão manual para não tentar reconectar
        StateStore.setManualDisconnect(true);
        StateStore.setAllowReconnect(false);

        if (typeof ws !== 'undefined' && ws !== null && ws.readyState === WebSocket.OPEN) {
            sendMessage("disconnect");
        }
        StateStore.setAllowLoginPrompt(false);
        StateStore.setLoginShown(false);
        StateStore.setSavedCredentials(null);
        StateManager.clearSessionState();
        ModalManager.hideLoginModal();
        ModalManager.resetLoginModalDismissal();
    },

    handleCancelReconnectClick() {
        if (typeof cancelReconnectAttempt === "function") {
            cancelReconnectAttempt();
        }
    },

    handleClearClick() {
        UIHelpers.clearOutput();
    },

    handleSendClick() {
        const input = getElement(CONFIG.SELECTORS.input);
        if (!input) return;

        // Em modo senha, usa valor bruto sem trim() para preservar espaços
        const isPasswordMode = input.type === "password";
        const command = isPasswordMode ? input.value : input.value.trim();
        if (command) {
            const connectionState = StateStore.getConnectionState();
            if (!["CONNECTED", "AWAITING_LOGIN"].includes(connectionState)) {
                eventsLogger.warn("Send blocked: state is not ready", connectionState);
                return;
            }

            eventsLogger.log("Sending command", isPasswordMode ? "***" : command);
            if (!isPasswordMode) this._pushCommandHistory(command);
            // Em modo senha, passa raw=true para evitar trim/split por ';' em senhas
            sendCommand(command, isPasswordMode);
            input.value = "";
            // Restaura input para texto normal após envio (ex: após digitar senha)
            UIHelpers.setInputSecure(false);
            input.focus();
            UIHelpers.flashInput();
            return;
        }

        if (!["CONNECTED", "AWAITING_LOGIN"].includes(StateStore.getConnectionState())) {
            eventsLogger.warn("Send blocked: state is not ready", StateStore.getConnectionState());
            return;
        }

        // Reusa o último texto bruto digitado (pode conter ";" para macros)
        const lastRawInput = this._commandHistory.length > 0 ? this._commandHistory[0] : null;
        if (lastRawInput) {
            eventsLogger.log("Resending last raw input", lastRawInput);
            this._pushCommandHistory(lastRawInput);
            sendCommand(lastRawInput);
            input.focus();
            UIHelpers.flashInput();
            UIHelpers.addSystemMessage(`[resend] ${lastRawInput}`, "#888");
            return;
        }

        eventsLogger.warn("Send blocked: empty command");
    },

    handleLoginSubmit() {
        const usernameInput = getElement(CONFIG.SELECTORS.usernameInput);
        const passwordInput = getElement(CONFIG.SELECTORS.passwordInput);
        const saveSessionInput = getElement(CONFIG.SELECTORS.saveSessionInput);
        const showPasswordInput = getElement(CONFIG.SELECTORS.showPasswordInput);

        if (!usernameInput || !passwordInput) return;

        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const saveSession = saveSessionInput ? saveSessionInput.checked : false;

        if (!username || !password) {
            eventsLogger.warn("Login blocked: missing credentials");
            return;
        }

        eventsLogger.log("Login form: saving credentials");
        StateStore.setSavedCredentials({ username, password });
        StorageManager.saveCredentials(username, password, saveSession);
        StateStore.setLoginShown(true);
        StateManager.saveLoginState();
        sendLogin(username, password);

        if (passwordInput) {
            passwordInput.value = "";
            passwordInput.type = "password";
        }
        if (showPasswordInput) showPasswordInput.checked = false;
        ModalManager.hideLoginModal();
    },

    sendConfirmYes() {
        eventsLogger.log("Sending confirm: yes");
        sendCommand("yes");
        ModalManager.hideConfirmModal();
    },

    sendConfirmNo() {
        eventsLogger.log("Sending confirm: no");
        sendCommand("no");
        ModalManager.hideConfirmModal();
    },

    /**
     * Requisita histórico mais antigo do servidor via WebSocket.
     */
    requestOlderHistory(loaderElement) {
        if (!loaderElement) return;

        const fromLineIndex = parseInt(loaderElement.dataset.fromLineIndex || "0");
        const hasMore = loaderElement.dataset.hasMore === 'true';
        const requestBatchSize = parseInt(
            loaderElement.dataset.batchSize || String(CONFIG.HISTORY_REQUEST.DEFAULT),
            10
        );

        if (!hasMore) {
            eventsLogger.log("No more history available");
            return;
        }

        if (typeof sendMessage === "function") {
            eventsLogger.log(`Requesting history from line ${fromLineIndex} with request batch size ${requestBatchSize}`);
            sendMessage("request_history", {
                from_line_index: fromLineIndex,
                num_lines: requestBatchSize
            });

            UIHelpers.setHistoryLoading(getElement(CONFIG.SELECTORS.output), true);
        } else {
            eventsLogger.warn("sendMessage não disponível - não foi possível requisitar histórico antigo");
        }
    }
};
