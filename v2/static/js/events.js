/**
 * events.js - Gerenciamento centralizado de eventos
 * Organiza todos os event listeners em um único lugar
 */

const eventsLogger = createLogger("events");

const EventManager = {
    initialized: false,

    init() {
        if (this.initialized) return;

        try {
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

    bindButtonEvents() {
        const btnLogin = getElement(CONFIG.SELECTORS.btnLogin);
        const btnDisconnect = getElement(CONFIG.SELECTORS.btnDisconnect);
        const btnClear = getElement(CONFIG.SELECTORS.btnClear);
        const btnSend = getElement(CONFIG.SELECTORS.btnSend);

        if (btnLogin) {
            btnLogin.addEventListener("click", () => {
                eventsLogger.log("Login button clicked");
                this.handleLoginClick();
            });
        }

        if (btnDisconnect) {
            btnDisconnect.addEventListener("click", () => {
                eventsLogger.log("Disconnect button clicked");
                this.handleDisconnectClick();
            });
        }

        if (btnClear) {
            btnClear.addEventListener("click", () => {
                eventsLogger.log("Clear output clicked");
                this.handleClearClick();
            });
        }

        if (btnSend) {
            btnSend.addEventListener("click", () => {
                eventsLogger.log("Send button clicked");
                this.handleSendClick();
            });
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
        });
    },

    bindLoginFormEvents() {
        const loginForm = getElement(CONFIG.SELECTORS.loginForm);
        const btnCancelLogin = getElement(CONFIG.SELECTORS.btnCancelLogin);

        if (loginForm) {
            loginForm.addEventListener("submit", (e) => {
                e.preventDefault();
                eventsLogger.log("Login form submitted");
                this.handleLoginSubmit();
            });
        }

        if (btnCancelLogin) {
            btnCancelLogin.addEventListener("click", () => {
                eventsLogger.log("Login cancel clicked - dismissing modal");
                ModalManager.dismissLoginModal();

                // Habilita o input para login manual
                const input = getElement(CONFIG.SELECTORS.input);
                if (input && currentState === "CONNECTED") {
                    input.disabled = false;
                    input.focus();
                }
            });
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
                    if (input && currentState === "CONNECTED") {
                        input.disabled = false;
                        input.focus();
                    }
                }
            });
        }

        if (confirmModal) {
            confirmModal.addEventListener("click", (e) => {
                if (e.target === confirmModal) {
                    eventsLogger.log("Confirm modal backdrop clicked");
                    this.sendConfirmNo();
                }
            });
        }

        if (btnConfirmYes) {
            btnConfirmYes.addEventListener("click", () => {
                eventsLogger.log("Confirm yes clicked");
                this.sendConfirmYes();
            });
        }

        if (btnConfirmNo) {
            btnConfirmNo.addEventListener("click", () => {
                eventsLogger.log("Confirm no clicked");
                this.sendConfirmNo();
            });
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
                if (input && currentState === "CONNECTED") {
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
        });
    },

    // Handlers
    handleLoginClick() {
        eventsLogger.log("Login button clicked - initiating connection");

        // Reseta flags de desconexão manual ao tentar conectar
        if (typeof isManualDisconnect !== 'undefined') {
            isManualDisconnect = false;
        }
        if (typeof allowReconnect !== 'undefined') {
            allowReconnect = true;
        }

        // Reseta flag de dismissal do modal para nova conexão
        ModalManager.resetLoginModalDismissal();

        allowLoginPrompt = true;
        loginShown = false;
        StateManager.saveLoginState();

        if (typeof ws !== 'undefined' && ws !== null && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "connect" }));
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
        if (typeof isManualDisconnect !== 'undefined') {
            isManualDisconnect = true;
        }
        if (typeof allowReconnect !== 'undefined') {
            allowReconnect = false;
        }

        if (typeof ws !== 'undefined' && ws !== null && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "disconnect" }));
        }
        allowLoginPrompt = false;
        loginShown = false;
        savedCredentials = null;
        StateManager.clearSessionState();
        ModalManager.hideLoginModal();
        ModalManager.resetLoginModalDismissal();
    },

    handleClearClick() {
        const output = getElement(CONFIG.SELECTORS.output);
        if (output) output.innerHTML = "";
    },

    handleSendClick() {
        if (currentState !== "CONNECTED") {
            eventsLogger.warn("Send blocked: state is not CONNECTED", currentState);
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
        savedCredentials = { username, password };
        StorageManager.saveCredentials(username, password, saveSession);
        loginShown = true;
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
