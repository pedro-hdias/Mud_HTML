/**
 * menu.js - Gerenciamento de menus interativos
 * Renderiza menus recebidos do backend como componentes clicáveis
 */

const menuLogger = createLogger("menu");

const MenuManager = {
    // Armazena o menu ativo atual
    currentMenu: null,
    // Handler de teclado para atalhos
    keyboardHandler: null,
    // Número mínimo de opções para considerar como menu
    minMenuOptions: 2,
    // Buffer de digitação para opções multi-caractere
    inputBuffer: "",
    // Timer para processar buffer
    inputTimer: null,
    // Duração máxima das chaves no menu atual
    maxKeyLength: 1,

    /** Cria o container HTML do menu */
    createMenuContainer(items) {
        const container = document.createElement("nav");
        container.className = "menu-container";
        container.setAttribute("role", "menu");
        container.setAttribute("aria-label", "Interactive options menu");

        const menuList = document.createElement("ul");
        menuList.className = "menu-list";
        menuList.setAttribute("role", "menubar");

        items.forEach((item, index) => {
            if (item.option) {
                const listItem = document.createElement("li");
                listItem.setAttribute("role", "none");

                const optionButton = document.createElement("button");
                optionButton.className = "menu-option";
                optionButton.setAttribute("role", "menuitem");
                optionButton.setAttribute("type", "button");
                optionButton.dataset.optionKey = item.option.key;
                optionButton.setAttribute("aria-label", `Option ${item.option.key}: ${item.option.text}`);
                optionButton.setAttribute("tabindex", index === 0 ? "0" : "-1");

                const numberSpan = document.createElement("span");
                numberSpan.className = "menu-number";
                numberSpan.setAttribute("aria-hidden", "true");
                numberSpan.textContent = `[${item.option.key}]`;

                const textSpan = document.createElement("span");
                textSpan.className = "menu-text";
                textSpan.textContent = item.option.text;

                optionButton.append(numberSpan, textSpan);
                optionButton.addEventListener("click", () => this.selectOption(item.option.key));
                optionButton.addEventListener("keydown", (e) => this.handleMenuKeydown(e, menuList));

                listItem.appendChild(optionButton);
                menuList.appendChild(listItem);
            } else if (item.isPrompt) {
                const promptEl = document.createElement("div");
                promptEl.className = "menu-prompt";
                promptEl.setAttribute("role", "status");
                promptEl.setAttribute("aria-live", "polite");
                promptEl.textContent = item.line;
                container.appendChild(promptEl);
            }
        });

        container.appendChild(menuList);
        return container;
    },

    /** Gerencia navegação por teclado no menu */
    handleMenuKeydown(e, menuList) {
        const menuItems = Array.from(menuList.querySelectorAll(".menu-option"));
        const currentIndex = menuItems.indexOf(e.target);
        let handled = true;
        let nextIndex = currentIndex;

        switch (e.key) {
            case "ArrowDown":
            case "Down":
                nextIndex = currentIndex < menuItems.length - 1 ? currentIndex + 1 : 0;
                menuItems[nextIndex].focus();
                break;

            case "ArrowUp":
            case "Up":
                nextIndex = currentIndex > 0 ? currentIndex - 1 : menuItems.length - 1;
                menuItems[nextIndex].focus();
                break;

            case "Home":
                menuItems[0].focus();
                break;

            case "End":
                menuItems[menuItems.length - 1].focus();
                break;

            case "Enter":
            case " ":
                this.selectOption(e.target.dataset.optionKey);
                break;

            default:
                handled = false;
        }

        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    },

    /** Seleciona uma opção do menu */
    selectOption(optionKey) {
        if (!this.currentMenu) return;

        const keyStr = optionKey.toString().toLowerCase();
        const validOption = this.currentMenu.options.find(opt => opt.key.toLowerCase() === keyStr);

        if (!validOption) {
            menuLogger.warn("Invalid option key:", optionKey);
            return;
        }

        menuLogger.log("Option selected:", validOption.key);

        // Marca a opção como selecionada
        const selectedButton = this.currentMenu.container.querySelector(
            `[data-option-key="${validOption.key}"]`
        );
        if (selectedButton) {
            selectedButton.classList.add("menu-option-selected");
            selectedButton.setAttribute("aria-pressed", "true");
            selectedButton.disabled = true;
        }

        this.deactivateMenu();
        sendCommand(validOption.key);
    },

    /** Aborta o menu atual enviando comando de abort */
    abortMenu() {
        if (!this.currentMenu) return;

        menuLogger.log("Menu aborted via ESC key");

        // Mostra feedback visual de abort
        const feedback = document.createElement("div");
        feedback.className = "menu-input-feedback abort";
        feedback.setAttribute("role", "status");
        feedback.setAttribute("aria-live", "polite");
        feedback.textContent = "Menu cancelado (ESC)";

        if (this.currentMenu.container) {
            this.currentMenu.container.insertBefore(feedback, this.currentMenu.container.firstChild);

            // Remove feedback após 1.5 segundos
            setTimeout(() => {
                if (feedback && feedback.parentNode) {
                    feedback.remove();
                }
            }, 1500);
        }

        // Desativa o menu
        this.deactivateMenu();

        // Envia comando de abort ('a' é o comando padrão de abort em MUDs)
        sendCommand("a");
    },

    /** Ativa os atalhos de teclado para o menu */
    activateKeyboardShortcuts() {
        if (this.keyboardHandler) {
            document.removeEventListener("keydown", this.keyboardHandler);
        }

        // Calcula o comprimento máximo das chaves do menu
        this.maxKeyLength = Math.max(...this.currentMenu.options.map(opt => opt.key.length));
        this.inputBuffer = "";

        menuLogger.log(`Menu com ${this.currentMenu.options.length} opções, comprimento máximo: ${this.maxKeyLength}`);

        this.keyboardHandler = (e) => {
            if (!this.currentMenu) return;

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

                // Mostra feedback visual
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

            // Se menu tem apenas opções de 1 caractere, envia imediatamente
            if (this.maxKeyLength === 1) {
                const validOption = this.currentMenu.options.find(opt =>
                    opt.key.toLowerCase() === e.key.toLowerCase()
                );
                if (validOption) {
                    this.selectOption(e.key);
                }
                return;
            }

            // Menu com opções multi-caractere: usa buffer
            this.inputBuffer += e.key;
            menuLogger.log(`Buffer atualizado: "${this.inputBuffer}" (max: ${this.maxKeyLength})`);

            // Mostra feedback visual
            this.updateInputFeedback();

            // Se buffer já tem o comprimento máximo, processa imediatamente
            if (this.inputBuffer.length >= this.maxKeyLength) {
                this.processInputBuffer();
            } else {
                // Aguarda mais entrada
                this.resetInputTimer();
            }
        };

        document.addEventListener("keydown", this.keyboardHandler);
    },

    /** Reseta o timer de input */
    resetInputTimer() {
        this.clearInputTimer();
        this.inputTimer = setTimeout(() => {
            this.processInputBuffer();
        }, CONFIG.MENU_INPUT_DELAY_MS || 800);
    },

    /** Limpa o timer de input */
    clearInputTimer() {
        if (this.inputTimer) {
            clearTimeout(this.inputTimer);
            this.inputTimer = null;
        }
    },

    /** Processa o buffer de input */
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
            // Feedback visual de erro
            this.showInputError(input);
        }
    },

    /** Mostra feedback visual do buffer de digitação */
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

    /** Limpa feedback visual */
    clearInputFeedback() {
        if (!this.currentMenu) return;

        const feedback = this.currentMenu.container.querySelector(".menu-input-feedback");
        if (feedback) {
            feedback.remove();
        }
    },

    /** Mostra erro de input inválido */
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
            if (feedback && feedback.parentNode) {
                feedback.remove();
            }
        }, 2000);
    },

    /** Renderiza menu recebido do backend */
    renderBackendMenu(payload, output) {
        if (!payload || !Array.isArray(payload.options) || payload.options.length < this.minMenuOptions) {
            menuLogger.warn("Invalid backend menu payload", payload);
            return;
        }

        // Desativa menu anterior se existir
        this.deactivateMenu();

        const items = payload.options.map(option => ({ line: `[${option.key}] ${option.text}`, option }));
        if (payload.prompt) {
            items.push({ line: payload.prompt, option: null, isPrompt: true });
        }

        const menuContainer = this.createMenuContainer(items);
        
        // Renderiza no container separado de menus (melhor para accessibility)
        const menuRegion = document.getElementById("menuContainer");
        if (menuRegion) {
            menuRegion.innerHTML = "";
            menuRegion.appendChild(menuContainer);
        } else {
            // Fallback: renderiza no output se menuContainer não existir
            output.appendChild(menuContainer);
        }

        this.currentMenu = {
            container: menuContainer,
            options: payload.options
        };

        this.activateKeyboardShortcuts();
        menuLogger.log("Backend menu rendered with", payload.options.length, "options");
    },

    /** Desativa o menu atual */
    deactivateMenu() {
        if (this.keyboardHandler) {
            document.removeEventListener("keydown", this.keyboardHandler);
            this.keyboardHandler = null;
        }

        // Limpa buffer e timer
        this.clearInputTimer();
        this.inputBuffer = "";
        this.maxKeyLength = 1;
        this.clearInputFeedback();

        if (this.currentMenu) {
            this.currentMenu.container.classList.add("menu-inactive");
            this.currentMenu.container.setAttribute("aria-disabled", "true");

            this.currentMenu.container.querySelectorAll(".menu-option").forEach(btn => {
                btn.disabled = true;
                btn.setAttribute("tabindex", "-1");
            });

            // Remove menu do container separado
            const menuRegion = document.getElementById("menuContainer");
            if (menuRegion && this.currentMenu.container.parentNode === menuRegion) {
                menuRegion.innerHTML = "";
            }

            this.currentMenu = null;
        }

        menuLogger.log("Menu deactivated");
    },

    /** Desativa menus ativos */
    reset() {
        this.deactivateMenu();
    }
};
