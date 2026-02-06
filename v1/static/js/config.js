/**
 * config.js - Configurações centralizadas
 * Constantes, seletores DOM, padrões e configurações globais
 */

const CONFIG = {
    // URLs e endpoints
    WS_URL: `ws://${location.host}/ws`,

    // Chaves de armazenamento
    STORAGE_KEYS: {
        CREDENTIALS: 'mud_credentials',
        LOGGED_IN: 'mud_logged_in',
        ALLOW_LOGIN: 'mud_allow_login',
        WAS_CONNECTED: 'mud_was_connected'
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
        reconnectDelay: 1000,
        backendReadyDelay: 500
    },

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

function getAllElements(selector) {
    return document.querySelectorAll(selector);
}
