/**
 * events/keyboard.js - Navegação por histórico de comandos e atalhos de teclado
 * Contém: estado do histórico de comandos, _navigateHistory, _pushCommandHistory,
 * bindInputEvents, bindKeyboardEvents.
 * Mesclados em EventManager via Object.assign em events/bindings.js.
 * Depende de: config.js (CONFIG, getElement), modals.js (ModalManager),
 *             state/store.js (StateStore)
 */

// Logger compartilhado por todos os módulos do pacote events/
const eventsLogger = createLogger("events");

const _EventKeyboardState = {
    _commandHistory: [],
    _historyIndex: -1,
    _savedInput: ""
};

const _EventKeyboardMethods = {
    /**
     * Navega pelo histórico de comandos.
     * @param {HTMLInputElement} input - Campo de entrada
     * @param {number} direction - -1 para trás (↑), +1 para frente (↓)
     */
    _navigateHistory(input, direction) {
        if (this._commandHistory.length === 0) return;

        // Salva o input atual ao começar a navegar para cima
        if (this._historyIndex === -1 && direction === -1) {
            this._savedInput = input.value;
        }

        const newIndex = this._historyIndex + (-direction); // -1 sobe no array
        if (newIndex < 0 || newIndex >= this._commandHistory.length) {
            if (direction === 1) {
                // Voltou ao fim: restaura input salvo
                this._historyIndex = -1;
                input.value = this._savedInput;
            }
            return;
        }

        this._historyIndex = newIndex;
        input.value = this._commandHistory[newIndex];
        // Posiciona cursor no final
        input.setSelectionRange(input.value.length, input.value.length);
    },

    /**
     * Adiciona comando ao histórico, evitando duplicatas consecutivas.
     */
    _pushCommandHistory(command) {
        if (!command) return;
        if (this._commandHistory.length > 0 && this._commandHistory[0] === command) return;
        this._commandHistory.unshift(command);
        if (this._commandHistory.length > (CONFIG.COMMAND_HISTORY_MAX || 50)) {
            this._commandHistory.pop();
        }
        this._historyIndex = -1;
    },

    bindInputEvents() {
        const input = getElement(CONFIG.SELECTORS.input);
        if (!input) return;

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                this.handleSendClick();
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                this._navigateHistory(input, -1);
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                this._navigateHistory(input, 1);
            }
        }, { signal: this._abortController.signal });
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
                } else if (e.key.toLowerCase() === "n") {
                    eventsLogger.log("N pressed: confirm no");
                    this.sendConfirmNo();
                } else if (e.key === "Escape") {
                    eventsLogger.log("Escape pressed: dismissing without response");
                    ModalManager.dismissConfirmModal();
                } else if (e.key === "Enter") {
                    eventsLogger.log("Enter pressed: confirm yes");
                    this.sendConfirmYes();
                }
            }
        }, { signal: this._abortController.signal });
    }
};
