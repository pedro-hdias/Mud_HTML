/**
 * menu/state.js - Métodos de controle de estado do MenuManager
 * Contém: activateKeyboardShortcuts, resetInputTimer, clearInputTimer,
 * processInputBuffer, updateInputFeedback, clearInputFeedback, showInputError.
 * Mesclados em MenuManager via Object.assign em menu/controller.js.
 * Depende de: config.js (CONFIG, getElement), menu/parser.js (menuLogger)
 */

const _MenuStateMethods = {
    /**
     * Ativa atalhos de teclado para seleção rápida de opções do menu.
     */
    activateKeyboardShortcuts() {
        if (this.keyboardHandler) {
            document.removeEventListener("keydown", this.keyboardHandler);
        }

        // Calcula o comprimento máximo das chaves do menu atual
        this.maxKeyLength = Math.max(...this.currentMenu.options.map(opt => opt.key.length));
        this.inputBuffer = "";

        menuLogger.log(`Menu com ${this.currentMenu.options.length} opções, comprimento máximo: ${this.maxKeyLength}`);

        this.keyboardHandler = (e) => {
            if (!this.currentMenu) return;

            // Não intercepta teclas digitadas em campos de input ou textarea
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
                return;
            }

            // Ignora se modal está aberto
            const loginModal = getElement(CONFIG.SELECTORS.loginModal);
            const confirmModal = getElement(CONFIG.SELECTORS.confirmModal);
            if (loginModal?.classList.contains(CONFIG.CLASSES.show) ||
                confirmModal?.classList.contains(CONFIG.CLASSES.show)) {
                return;
            }

            // ESC: aborta o menu automaticamente
            if (e.key === "Escape") {
                e.preventDefault();
                this.abortMenu();
                return;
            }

            // Enter: processa buffer imediatamente
            if (e.key === "Enter" && this.inputBuffer) {
                e.preventDefault();
                this.processInputBuffer();
                return;
            }

            // Backspace: remove último caractere do buffer
            if (e.key === "Backspace" && this.inputBuffer) {
                e.preventDefault();
                this.inputBuffer = this.inputBuffer.slice(0, -1);
                menuLogger.log(`Buffer após backspace: "${this.inputBuffer}"`);

                this.updateInputFeedback();

                if (this.inputBuffer) {
                    this.resetInputTimer();
                } else {
                    this.clearInputTimer();
                }
                return;
            }

            // Apenas aceita caracteres alfanuméricos
            if (!/^[a-zA-Z0-9]$/.test(e.key)) return;

            e.preventDefault();

            // Menus com opções de 1 caractere: envio imediato
            if (this.maxKeyLength === 1) {
                const validOption = this.currentMenu.options.find(opt =>
                    opt.key.toLowerCase() === e.key.toLowerCase()
                );
                if (validOption) {
                    this.selectOption(e.key);
                }
                return;
            }

            // Menus com opções multi-caractere: usa buffer
            this.inputBuffer += e.key;
            menuLogger.log(`Buffer atualizado: "${this.inputBuffer}" (max: ${this.maxKeyLength})`);

            this.updateInputFeedback();

            if (this.inputBuffer.length >= this.maxKeyLength) {
                this.processInputBuffer();
            } else {
                this.resetInputTimer();
            }
        };

        document.addEventListener("keydown", this.keyboardHandler);
    },

    /** Reseta o timer de input do buffer. */
    resetInputTimer() {
        this.clearInputTimer();
        this.inputTimer = setTimeout(() => {
            this.processInputBuffer();
        }, CONFIG.MENU_INPUT_DELAY_MS || 800);
    },

    /** Limpa o timer de input do buffer. */
    clearInputTimer() {
        if (this.inputTimer) {
            clearTimeout(this.inputTimer);
            this.inputTimer = null;
        }
    },

    /** Processa o buffer de input e seleciona a opção correspondente. */
    processInputBuffer() {
        this.clearInputTimer();
        if (!this.inputBuffer) return;

        const input = this.inputBuffer;
        this.inputBuffer = "";
        this.clearInputFeedback();

        const validOption = this.currentMenu.options.find(opt =>
            opt.key.toLowerCase() === input.toLowerCase()
        );

        if (validOption) {
            menuLogger.log(`Opção válida encontrada: ${validOption.key}`);
            this.selectOption(validOption.key);
        } else {
            menuLogger.warn(`Opção inválida: "${input}"`);
            this.showInputError(input);
        }
    },

    /** Mostra feedback visual do buffer de digitação. */
    updateInputFeedback() {
        if (!this.currentMenu) return;

        let feedback = this.currentMenu.container.querySelector(".menu-input-feedback");
        if (!feedback) {
            feedback = document.createElement("div");
            feedback.className = "menu-input-feedback";
            feedback.setAttribute("role", "status");
            feedback.setAttribute("aria-live", "polite");
            this.currentMenu.container.insertBefore(feedback, this.currentMenu.container.firstChild);
        }

        feedback.textContent = `Digitando: ${this.inputBuffer}`;
        feedback.classList.remove("error");
    },

    /** Limpa o feedback visual do buffer. */
    clearInputFeedback() {
        if (!this.currentMenu) return;
        const feedback = this.currentMenu.container.querySelector(".menu-input-feedback");
        if (feedback) feedback.remove();
    },

    /** Exibe mensagem de erro para opção inválida. */
    showInputError(input) {
        if (!this.currentMenu) return;

        let feedback = this.currentMenu.container.querySelector(".menu-input-feedback");
        if (!feedback) {
            feedback = document.createElement("div");
            feedback.className = "menu-input-feedback error";
            feedback.setAttribute("role", "alert");
            this.currentMenu.container.insertBefore(feedback, this.currentMenu.container.firstChild);
        } else {
            feedback.classList.add("error");
        }

        feedback.textContent = `Opção inválida: ${input}`;

        setTimeout(() => {
            if (feedback && feedback.parentNode) feedback.remove();
        }, 2000);
    }
};
