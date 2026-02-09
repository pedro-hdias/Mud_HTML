/**
 * events.js - Gerenciamento centralizado de eventos
 * Organiza todos os event listeners em um único lugar
 */

const eventsLogger = createLogger("events");

const EventManager = {
    initialized: false,
    _abortController: null,

    init() {
        if (this.initialized) return;

        try {
            // AbortController permite remover todos os listeners de uma vez
            // e garante que re-inicialização não duplica listeners
            this._abortController = new AbortController();

            this.bindButtonEvents();
            this.bindInputEvents();
            this.bindLoginFormEvents();
            this.bindModalEvents();
            this.bindKeyboardEvents();
            this.initialized = true;
            eventsLogger.log("Event manager initialized");
        } catch (e) {
            eventsLogger.error("Error initializing events", e);
        }
    },

    /**
     * Destroi todos os event listeners registrados.
     * Permite re-inicialização limpa se necessário.
     */
    destroy() {
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
        }
        this.initialized = false;
        eventsLogger.log("Event manager destroyed");
    },

    bindButtonEvents() {
        const btnLogin = getElement(CONFIG.SELECTORS.btnLogin);
        const btnDisconnect = getElement(CONFIG.SELECTORS.btnDisconnect);
        const btnClear = getElement(CONFIG.SELECTORS.btnClear);
        const btnSend = getElement(CONFIG.SELECTORS.btnSend);
        const btnCancelReconnect = getElement(CONFIG.SELECTORS.btnCancelReconnect);

        if (btnLogin) {
            btnLogin.addEventListener("click", () => {
                eventsLogger.log("Login button clicked");
                this.handleLoginClick();
            }, { signal: this._abortController.signal });
        }

        if (btnDisconnect) {
            btnDisconnect.addEventListener("click", () => {
                eventsLogger.log("Disconnect button clicked");
                this.handleDisconnectClick();
            }, { signal: this._abortController.signal });
        }

        if (btnClear) {
            btnClear.addEventListener("click", () => {
                eventsLogger.log("Clear output clicked");
                this.handleClearClick();
            }, { signal: this._abortController.signal });
        }

        if (btnSend) {
            btnSend.addEventListener("click", () => {
                eventsLogger.log("Send button clicked");
                this.handleSendClick();
            }, { signal: this._abortController.signal });
        }

        if (btnCancelReconnect) {
            btnCancelReconnect.addEventListener("click", () => {
                eventsLogger.log("Cancel reconnect clicked");
                this.handleCancelReconnectClick();
            }, { signal: this._abortController.signal });
        }
    },

    bindInputEvents() {
        const input = getElement(CONFIG.SELECTORS.input);
        if (!input) return;

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                this.handleSendClick();
            }
        }, { signal: this._abortController.signal });
    },

    bindLoginFormEvents() {
        const loginForm = getElement(CONFIG.SELECTORS.loginForm);
        const btnCancelLogin = getElement(CONFIG.SELECTORS.btnCancelLogin);

        if (loginForm) {
            loginForm.addEventListener("submit", (e) => {
                e.preventDefault();
                eventsLogger.log("Login form submitted");
                this.handleLoginSubmit();
            }, { signal: this._abortController.signal });
        }

        if (btnCancelLogin) {
            btnCancelLogin.addEventListener("click", () => {
                eventsLogger.log("Login cancel clicked - dismissing modal");
                ModalManager.dismissLoginModal();

                // Habilita o input para login manual
                const input = getElement(CONFIG.SELECTORS.input);
                if (input && StateStore.getConnectionState() === "CONNECTED") {
                    input.disabled = false;
                    input.focus();
                }
            }, { signal: this._abortController.signal });
        }
    },

    bindModalEvents() {
        const loginModal = getElement(CONFIG.SELECTORS.loginModal);
        const confirmModal = getElement(CONFIG.SELECTORS.confirmModal);
        const btnConfirmYes = getElement(CONFIG.SELECTORS.btnConfirmYes);
        const btnConfirmNo = getElement(CONFIG.SELECTORS.btnConfirmNo);

        if (loginModal) {
            loginModal.addEventListener("click", (e) => {
                if (e.target === loginModal) {
                    eventsLogger.log("Login modal backdrop clicked - dismissing");
                    ModalManager.dismissLoginModal();

                    // Habilita o input para login manual
                    const input = getElement(CONFIG.SELECTORS.input);
                    if (input && StateStore.getConnectionState() === "CONNECTED") {
                        input.disabled = false;
                        input.focus();
                    }
                }
            }, { signal: this._abortController.signal });
        }

        if (confirmModal) {
            confirmModal.addEventListener("click", (e) => {
                if (e.target === confirmModal) {
                    eventsLogger.log("Confirm modal backdrop clicked");
                    this.sendConfirmNo();
                }
            }, { signal: this._abortController.signal });
        }

        if (btnConfirmYes) {
            btnConfirmYes.addEventListener("click", () => {
                eventsLogger.log("Confirm yes clicked");
                this.sendConfirmYes();
            }, { signal: this._abortController.signal });
        }

        if (btnConfirmNo) {
            btnConfirmNo.addEventListener("click", () => {
                eventsLogger.log("Confirm no clicked");
                this.sendConfirmNo();
            }, { signal: this._abortController.signal });
        }
    },

    bindKeyboardEvents() {
        document.addEventListener("keydown", (e) => {
            const loginModal = getElement(CONFIG.SELECTORS.loginModal);
            if (e.key === "Escape" && loginModal && loginModal.classList.contains(CONFIG.CLASSES.show)) {
                eventsLogger.log("Escape pressed: dismissing login modal");
                ModalManager.dismissLoginModal();

                // Habilita o input para login manual
                const input = getElement(CONFIG.SELECTORS.input);
                if (input && StateStore.getConnectionState() === "CONNECTED") {
                    input.disabled = false;
                    input.focus();
                }
            }

            if (ModalManager.confirmShown) {
                if (e.key.toLowerCase() === "y") {
                    eventsLogger.log("Y pressed: confirm yes");
                    this.sendConfirmYes();
                } else if (e.key.toLowerCase() === "n" || e.key === "Escape") {
                    eventsLogger.log("N/Escape pressed: confirm no");
                    this.sendConfirmNo();
                } else if (e.key === "Enter") {
                    eventsLogger.log("Enter pressed: confirm yes");
                    this.sendConfirmYes();
                }
            }
        }, { signal: this._abortController.signal });
    },

    // Handlers
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
            // Conecta o WebSocket
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
        const output = getElement(CONFIG.SELECTORS.output);
        if (output) output.innerHTML = "";
    },

    handleSendClick() {
        if (StateStore.getConnectionState() !== "CONNECTED") {
            eventsLogger.warn("Send blocked: state is not CONNECTED", StateStore.getConnectionState());
            return;
        }

        const input = getElement(CONFIG.SELECTORS.input);
        if (!input) return;

        const command = input.value.trim();
        if (command) {
            eventsLogger.log("Sending command", command);
            sendCommand(command);
            input.value = "";
            input.focus();
            return;
        }

        if (typeof getLastCommandSent === "function") {
            const lastCommand = getLastCommandSent();
            if (lastCommand) {
                eventsLogger.log("Resending last command", lastCommand);
                sendCommand(lastCommand);
                input.focus();
                return;
            }
        }

        eventsLogger.warn("Send blocked: empty command");
    },

    handleLoginSubmit() {
        const usernameInput = getElement(CONFIG.SELECTORS.usernameInput);
        const passwordInput = getElement(CONFIG.SELECTORS.passwordInput);
        const saveSessionInput = getElement(CONFIG.SELECTORS.saveSessionInput);

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

        if (passwordInput) passwordInput.value = "";
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
    }
};

// Inicializar quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        EventManager.init();
    });
} else {
    EventManager.init();
}
