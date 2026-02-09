/**
 * state.js - Gerenciamento de estado da aplicação
 * Mantém apenas lógica de estado, delegando armazenamento e modais para outros módulos
 */

let currentState = "DISCONNECTED";
let savedCredentials = null;
let loginShown = false;
let allowLoginPrompt = false;
let loginModalScheduled = false;
const stateLogger = createLogger("state");

// Gerenciador de estado
const StateManager = {
    loadSessionState() {
        try {
            savedCredentials = StorageManager.getCredentials();
            const wasLoggedIn = StorageManager.isLoggedIn();
            const allowLogin = StorageManager.isAllowLoginPrompt();

            allowLoginPrompt = allowLogin;
            loginShown = wasLoggedIn;

            stateLogger.log("Loaded session state", { wasLoggedIn, allowLogin });
        } catch (e) {
            stateLogger.error("Error loading session state", e);
        }
    },

    saveLoginState() {
        try {
            StorageManager.setLoggedIn(loginShown);
            StorageManager.setAllowLoginPrompt(allowLoginPrompt);
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
            savedCredentials = null;
            loginShown = false;
            allowLoginPrompt = false;
            loginModalScheduled = false;
            stateLogger.log("Cleared session state");
        } catch (e) {
            stateLogger.error("Error clearing session state", e);
        }
    }
};

// Atualiza interface baseada no estado
function updateConnectionState(state) {
    stateLogger.log("State change", currentState, "->", state);
    currentState = state;

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
            if (!window.isReconnecting && window.sessionInitialized) {
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
            if (window.isReconnecting && savedCredentials && !loginShown) {
                stateLogger.log("Reconnecting - attempting auto-login");
                setTimeout(() => {
                    sendLogin(savedCredentials.username, savedCredentials.password);
                    loginShown = true;
                    StateManager.saveLoginState();
                }, CONFIG.TIMEOUTS.reconnectDelay);
                window.isReconnecting = false;
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
    stateLogger.log("Check login display", "state:", currentState, "shown:", loginShown);

    if (!allowLoginPrompt) {
        stateLogger.warn("Login display blocked: prompt not allowed");
        return;
    }

    if (!loginShown && currentState === "CONNECTED") {
        if (savedCredentials) {
            stateLogger.log("Using saved credentials for login");
            sendLogin(savedCredentials.username, savedCredentials.password);
            loginShown = true;
        } else {
            if (loginModalScheduled) {
                stateLogger.warn("Login modal already scheduled");
                return;
            }
            loginModalScheduled = true;
            loginShown = true;
            setTimeout(() => {
                ModalManager.showLoginModal();
            }, CONFIG.TIMEOUTS.loginModalDelay);
        }
    } else if (loginShown) {
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