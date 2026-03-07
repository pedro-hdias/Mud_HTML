/**
 * state/store.js - Armazenamento central de estado da aplicação
 * Contém o objeto StateStore com todos os campos reativos, getters/setters,
 * sistema de eventos (_emit, on, off) e resetSessionFlags.
 */

const stateLogger = createLogger("state");

const StateStore = {
    _listeners: {},
    _connectionState: "DISCONNECTED",
    _sessionPhase: "UNAUTHENTICATED", // "UNAUTHENTICATED" | "AUTH_IN_PROGRESS" | "IN_GAME"
    _savedCredentials: null,
    _loginShown: false,
    _allowLoginPrompt: false,
    _loginModalScheduled: false,
    _isReconnecting: false,
    _sessionInitialized: false,
    _connectRequested: false,
    _allowReconnect: false,
    _manualDisconnect: false,

    on(event, handler) {
        if (!this._listeners[event]) {
            this._listeners[event] = new Set();
        }
        this._listeners[event].add(handler);
        // Retorna função de remoção para facilitar cleanup
        return () => this._listeners[event].delete(handler);
    },

    /**
     * Remove um handler específico de um evento.
     * Alternativa explícita ao callback retornado por on().
     */
    off(event, handler) {
        const handlers = this._listeners[event];
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                delete this._listeners[event];
            }
        }
    },

    /**
     * Remove todos os listeners. Se 'event' for informado,
     * remove apenas os listeners daquele evento.
     */
    removeAllListeners(event) {
        if (event) {
            delete this._listeners[event];
        } else {
            this._listeners = {};
        }
    },

    _emit(event, payload) {
        const handlers = this._listeners[event];
        if (!handlers) return;
        handlers.forEach(handler => {
            try {
                handler(payload);
            } catch (e) {
                stateLogger.error("StateStore handler error", e, event);
            }
        });
    },

    getConnectionState() {
        return this._connectionState;
    },
    setConnectionState(value) {
        const previous = this._connectionState;
        this._connectionState = value;
        this._emit("connectionState", { previous, value });
        return previous;
    },
    getSessionPhase() {
        return this._sessionPhase;
    },
    setSessionPhase(phase) {
        const previous = this._sessionPhase;
        if (previous === phase) return previous;
        this._sessionPhase = phase;
        this._emit("sessionPhase", { previous, value: phase });
        return previous;
    },
    getSavedCredentials() {
        return this._savedCredentials;
    },
    setSavedCredentials(value) {
        const previous = this._savedCredentials;
        this._savedCredentials = value;
        this._emit("savedCredentials", { previous, value });
    },
    isLoginShown() {
        return this._loginShown;
    },
    setLoginShown(value) {
        const previous = this._loginShown;
        this._loginShown = value;
        this._emit("loginShown", { previous, value });
    },
    isLoginPromptAllowed() {
        return this._allowLoginPrompt;
    },
    setAllowLoginPrompt(value) {
        const previous = this._allowLoginPrompt;
        this._allowLoginPrompt = value;
        this._emit("allowLoginPrompt", { previous, value });
    },
    isLoginModalScheduled() {
        return this._loginModalScheduled;
    },
    setLoginModalScheduled(value) {
        const previous = this._loginModalScheduled;
        this._loginModalScheduled = value;
        this._emit("loginModalScheduled", { previous, value });
    },
    isReconnecting() {
        return this._isReconnecting;
    },
    setIsReconnecting(value) {
        const previous = this._isReconnecting;
        this._isReconnecting = value;
        this._emit("isReconnecting", { previous, value });
    },
    isSessionInitialized() {
        return this._sessionInitialized;
    },
    setSessionInitialized(value) {
        const previous = this._sessionInitialized;
        this._sessionInitialized = value;
        this._emit("sessionInitialized", { previous, value });
    },
    isConnectRequested() {
        return this._connectRequested;
    },
    setConnectRequested(value) {
        const previous = this._connectRequested;
        this._connectRequested = value;
        this._emit("connectRequested", { previous, value });
    },
    isReconnectAllowed() {
        return this._allowReconnect;
    },
    setAllowReconnect(value) {
        const previous = this._allowReconnect;
        this._allowReconnect = value;
        this._emit("allowReconnect", { previous, value });
    },
    isManualDisconnect() {
        return this._manualDisconnect;
    },
    setManualDisconnect(value) {
        const previous = this._manualDisconnect;
        this._manualDisconnect = value;
        this._emit("manualDisconnect", { previous, value });
    },
    resetSessionFlags() {
        this._savedCredentials = null;
        this._loginShown = false;
        this._allowLoginPrompt = false;
        this._loginModalScheduled = false;
        this._sessionPhase = "UNAUTHENTICATED";
        this._emit("sessionFlagsReset", {});
    }
};
