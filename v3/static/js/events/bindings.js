/**
 * events/bindings.js - EventManager: coordenador central de eventos
 * Mescla todos os grupos de métodos dos submódulos em EventManager.
 * Depende de: events/keyboard.js, events/forms.js, events/actions.js
 */

const EventManager = Object.assign(
    {
        initialized: false,
        _abortController: null
    },
    _EventKeyboardState,
    _EventKeyboardMethods,
    _EventFormsMethods,
    _EventActionsMethods,
    {
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
                this.bindOutputEvents();
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
                        eventsLogger.log("Confirm modal backdrop clicked - dismissing without response");
                        ModalManager.dismissConfirmModal();
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

        bindOutputEvents() {
            const output = getElement(CONFIG.SELECTORS.output);
            if (!output) return;

            // Event delegado para cliques no history-loader
            output.addEventListener("click", (e) => {
                const loader = e.target.closest('details.history-loader');
                if (loader) {
                    if (loader.getAttribute('aria-disabled') === 'true') {
                        e.preventDefault();
                        return;
                    }
                    if (loader.open) {
                        eventsLogger.log("History loader expanded - requesting older messages");
                        this.requestOlderHistory(loader);
                    }
                }
            }, { signal: this._abortController.signal });
        }
    }
);

// Inicializar quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        EventManager.init();
    });
} else {
    EventManager.init();
}
