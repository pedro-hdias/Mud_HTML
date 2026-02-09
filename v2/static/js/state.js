/**
 * state.js - Gerenciamento de estado da aplicação
 * Mantém apenas lógica de estado, delegando armazenamento e modais para outros módulos
 */

const stateLogger = createLogger("state");

const StateStore = {
    _connectionState: "DISCONNECTED",
    _savedCredentials: null,
    _loginShown: false,
    _allowLoginPrompt: false,
    _loginModalScheduled: false,
    _isReconnecting: false,
    _sessionInitialized: false,
    _connectRequested: false,
    _allowReconnect: false,
    _manualDisconnect: false,

    getConnectionState() {
        return this._connectionState;
    },
    setConnectionState(value) {
        const previous = this._connectionState;
        this._connectionState = value;
        return previous;
    },
    getSavedCredentials() {
        return this._savedCredentials;
    },
    setSavedCredentials(value) {
        this._savedCredentials = value;
    },
    isLoginShown() {
        return this._loginShown;
    },
    setLoginShown(value) {
        this._loginShown = value;
    },
    isLoginPromptAllowed() {
        return this._allowLoginPrompt;
    },
    setAllowLoginPrompt(value) {
        this._allowLoginPrompt = value;
    },
    isLoginModalScheduled() {
        return this._loginModalScheduled;
    },
    setLoginModalScheduled(value) {
        this._loginModalScheduled = value;
    },
    isReconnecting() {
        return this._isReconnecting;
    },
    setIsReconnecting(value) {
        this._isReconnecting = value;
    },
    isSessionInitialized() {
        return this._sessionInitialized;
    },
    setSessionInitialized(value) {
        this._sessionInitialized = value;
    },
    isConnectRequested() {
        return this._connectRequested;
    },
    setConnectRequested(value) {
        this._connectRequested = value;
    },
    isReconnectAllowed() {
        return this._allowReconnect;
    },
    setAllowReconnect(value) {
        this._allowReconnect = value;
    },
    isManualDisconnect() {
        return this._manualDisconnect;
    },
    setManualDisconnect(value) {
        this._manualDisconnect = value;
    },
    resetSessionFlags() {
        this._savedCredentials = null;
        this._loginShown = false;
        this._allowLoginPrompt = false;
        this._loginModalScheduled = false;
    }
};

// Gerenciador de estado
const StateManager = {
    loadSessionState() {
        try {
            StateStore.setSavedCredentials(StorageManager.getCredentials());
            const wasLoggedIn = StorageManager.isLoggedIn();
            const allowLogin = StorageManager.isAllowLoginPrompt();

            StateStore.setAllowLoginPrompt(allowLogin);
            StateStore.setLoginShown(wasLoggedIn);

            stateLogger.log("Loaded session state", { wasLoggedIn, allowLogin });
        } catch (e) {
            stateLogger.error("Error loading session state", e);
        }
    },

    saveLoginState() {
        try {
            StorageManager.setLoggedIn(StateStore.isLoginShown());
            StorageManager.setAllowLoginPrompt(StateStore.isLoginPromptAllowed());
            stateLogger.log("Saved login state");
        } catch (e) {
            stateLogger.error("Error saving login state", e);
        }
    },

    saveConnectionState() {
        // Não salva mais o estado de conexão para evitar reconexão automática
        // A conexão agora é sempre manual através do botão Login
    },

    clearSessionState() {
        try {
            StorageManager.clearAll();
            StateStore.resetSessionFlags();
            stateLogger.log("Cleared session state");
        } catch (e) {
            stateLogger.error("Error clearing session state", e);
        }
    }
};

// Atualiza interface baseada no estado
function updateConnectionState(state) {
    const previousState = StateStore.setConnectionState(state);
    stateLogger.log("State change", previousState, "->", state);

    const statusDot = getElement(CONFIG.SELECTORS.statusDot);
    const statusText = getElement(CONFIG.SELECTORS.statusText);
    const btnLogin = getElement(CONFIG.SELECTORS.btnLogin);
    const btnDisconnect = getElement(CONFIG.SELECTORS.btnDisconnect);
    const btnSend = getElement(CONFIG.SELECTORS.btnSend);
    const input = getElement(CONFIG.SELECTORS.input);

    if (statusDot) statusDot.className = "";

    switch (state) {
        case "DISCONNECTED":
            if (statusText) statusText.textContent = "Desconectado";
            if (btnLogin) btnLogin.disabled = false;
            if (btnDisconnect) btnDisconnect.disabled = true;
            if (btnSend) btnSend.disabled = true;
            if (input) input.disabled = true;
            if (!StateStore.isReconnecting() && StateStore.isSessionInitialized()) {
                StateManager.clearSessionState();
            }
            break;

        case "CONNECTING":
            if (statusText) statusText.textContent = "Conectando...";
            if (statusDot) statusDot.classList.add(CONFIG.CLASSES.connecting);
            if (btnLogin) btnLogin.disabled = true;
            if (btnDisconnect) btnDisconnect.disabled = true;
            if (btnSend) btnSend.disabled = true;
            if (input) input.disabled = true;
            break;

        case "CONNECTED":
            if (statusText) statusText.textContent = "Conectado";
            if (statusDot) statusDot.classList.add(CONFIG.CLASSES.connected);
            if (btnLogin) btnLogin.disabled = true;
            if (btnDisconnect) btnDisconnect.disabled = false;
            if (btnSend) btnSend.disabled = false;
            if (input) {
                input.disabled = false;
                input.focus();
            }

            // Se estamos reconectando, tenta fazer login automaticamente
            const savedCredentials = StateStore.getSavedCredentials();
            if (StateStore.isReconnecting() && savedCredentials && !StateStore.isLoginShown()) {
                stateLogger.log("Reconnecting - attempting auto-login");
                setTimeout(() => {
                    sendLogin(savedCredentials.username, savedCredentials.password);
                    StateStore.setLoginShown(true);
                    StateManager.saveLoginState();
                }, CONFIG.TIMEOUTS.reconnectDelay);
                StateStore.setIsReconnecting(false);
            }
            break;

        case "AWAITING_LOGIN":
            if (statusText) statusText.textContent = "Aguardando login";
            if (statusDot) statusDot.classList.add(CONFIG.CLASSES.connected);
            if (btnLogin) btnLogin.disabled = true;
            if (btnDisconnect) btnDisconnect.disabled = false;
            if (btnSend) btnSend.disabled = true;
            if (input) input.disabled = true;
            break;
    }
}

// Verifica e exibe modal de login
function checkAndShowLogin() {
    stateLogger.log("Check login display", "state:", StateStore.getConnectionState(), "shown:", StateStore.isLoginShown());

    if (!StateStore.isLoginPromptAllowed()) {
        stateLogger.warn("Login display blocked: prompt not allowed");
        return;
    }

    if (!StateStore.isLoginShown() && StateStore.getConnectionState() === "CONNECTED") {
        const savedCredentials = StateStore.getSavedCredentials();
        if (savedCredentials) {
            stateLogger.log("Using saved credentials for login");
            sendLogin(savedCredentials.username, savedCredentials.password);
            StateStore.setLoginShown(true);
        } else {
            if (StateStore.isLoginModalScheduled()) {
                stateLogger.warn("Login modal already scheduled");
                return;
            }
            StateStore.setLoginModalScheduled(true);
            StateStore.setLoginShown(true);
            setTimeout(() => {
                ModalManager.showLoginModal();
            }, CONFIG.TIMEOUTS.loginModalDelay);
        }
    } else if (StateStore.isLoginShown()) {
        stateLogger.warn("Login display blocked: already shown");
    } else {
        stateLogger.warn("Login display blocked: state is not CONNECTED");
    }
}

// Inicialização: carrega estado salvo quando a página carrega
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        StateManager.loadSessionState();
        stateLogger.log("Session state loaded on DOMContentLoaded");
    });
} else {
    StateManager.loadSessionState();
    stateLogger.log("Session state loaded immediately");
}