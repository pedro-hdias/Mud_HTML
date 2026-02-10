/**
 * config.js - Configurações centralizadas
 * Constantes, seletores DOM, padrões e configurações globais
 */

/**
 * Lê configuração de <meta name="mud-*"> tags do HTML.
 * Permite externalizar valores sem alterar JS.
 */
function _readMeta(name, fallback) {
    const el = document.querySelector(`meta[name="${name}"]`);
    return el ? el.getAttribute("content") : fallback;
}

const CONFIG = {
    // URLs e endpoints
    WS: {
        url: _readMeta("mud-ws-url", `ws://${location.host}/ws`),
        reconnectMaxAttempts: 5,
        reconnectBaseDelayMs: 1000,
        reconnectMaxDelayMs: 30000,
        backendReadyDelayMs: 500,
        messageMeta: {
            client: "web"
        }
    },

    // Histórico de comandos (setas ↑/↓)
    COMMAND_HISTORY_MAX: 50,

    // Chaves de armazenamento
    STORAGE_KEYS: {
        CREDENTIALS: 'mud_credentials',
        LOGGED_IN: 'mud_logged_in',
        ALLOW_LOGIN: 'mud_allow_login',
        WAS_CONNECTED: 'mud_was_connected',
        PUBLIC_ID: 'mud_public_id',
        OWNER: 'mud_owner'
    },

    // Seletores DOM
    SELECTORS: {
        // Elementos principais
        output: "#output",
        input: "#input",

        // Botões
        btnLogin: "#btnLogin",
        btnDisconnect: "#btnDisconnect",
        btnClear: "#btnClear",
        btnSend: "#btnSend",
        btnCancelLogin: "#btnCancelLogin",
        btnCancelReconnect: "#btnCancelReconnect",

        // Reconexao
        reconnectStatus: "#reconnectStatus",

        // Status
        statusDot: "#statusDot",
        statusText: "#statusText",

        // Modal de login
        loginModal: "#loginModal",
        loginForm: "#loginForm",
        usernameInput: "#username",
        passwordInput: "#password",
        saveSessionInput: "#saveSession",

        // Modal de confirmação
        confirmModal: "#confirmModal",
        confirmText: "#confirmText",
        btnConfirmYes: "#btnConfirmYes",
        btnConfirmNo: "#btnConfirmNo"
    },

    // Padrões para detecção de prompts de confirmação
    CONFIRM_PATTERNS: [
        /are you sure you'd like to do this\?/i,
        /\[enter\s+"?yes"?\s+or\s+"?no"?\]/i,
        /enter\s+"?yes"?\s+or\s+"?no"?/i
    ],

    // Classes CSS
    CLASSES: {
        show: "show",
        connected: "connected",
        connecting: "connecting",
        historyBlock: "history-block",
        outputLine: "output-line",
        systemMessage: "system-message",
        new: "new",
        history: "history"
    },

    // Timeouts
    TIMEOUTS: {
        loginModalDelay: 500,
        reconnectDelay: 1000
    },

    // Output
    OUTPUT_MAX_LINES: 2000,
    OUTPUT_HISTORY_MAX_LINES: 2000,

    // Fila de comandos pendentes (quando desconectado temporariamente)
    COMMAND_QUEUE_MAX: 10,

    // Menu interativo
    MENU_TIMEOUT_MS: 2500,

    // Cookie config
    COOKIE_EXPIRY_DAYS: 30
};

// Função helper para obter elemento do DOM com cache
const DOM_CACHE = {};

function getElement(selector) {
    if (!DOM_CACHE[selector]) {
        DOM_CACHE[selector] = document.querySelector(selector);
    }
    return DOM_CACHE[selector];
}

function invalidateElementCache(selector) {
    if (selector) {
        delete DOM_CACHE[selector];
    } else {
        Object.keys(DOM_CACHE).forEach(key => delete DOM_CACHE[key]);
    }
}

function getAllElements(selector) {
    return document.querySelectorAll(selector);
}

