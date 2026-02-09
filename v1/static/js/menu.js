/**
 * menu.js - Gerenciamento de menus interativos
 * Detecta e renderiza listas numeradas como menus clicáveis
 */

const menuLogger = createLogger("menu");

const MenuManager = {
    // Armazena o menu ativo atual
    currentMenu: null,
    // Buffer de linhas para detectar menus
    lineBuffer: [],
    // Tempo máximo entre linhas de um menu (ms)
    menuTimeout: 1500,
    // Timer para detecção de fim de menu
    menuTimer: null,
    // Número mínimo de opções para considerar como menu
    minMenuOptions: 2,
    // Tamanho máximo da chave para ser considerado menu (evita [info], [chat], etc.)
    maxKeyLength: 3,

    // Padrões para detectar opções de menu: [1] Texto, 1. Texto, 1) Texto
    menuPatterns: [
        /^\[([a-zA-Z0-9]+)\]\s*-?\s*(.+)$/,  // [n] - Opção ou [n] Opção
        /^([a-zA-Z0-9]+)\s*[-:.]\s*(.+)$/,   // n - Opção, n: Opção, n. Opção
        /^([a-zA-Z0-9]+)\)\s*(.+)$/,         // n) Opção
    ],

    // Padrões que indicam fim de menu ou prompt de seleção
    promptPatterns: [
        /enter your selection|escolha uma op[cç][aã]o|digite o n[uú]mero|digite.*letra/i,
        /select an option|make your choice|what.*do.*you.*want/i,
        /^>/,  // Prompt simples
    ],

    /**
     * Detecta se uma linha é uma opção de menu
     * @param {string} line - Linha de texto
     * @returns {Object|null} - {key, text, number, isNumber} ou null
     */
    detectMenuOption(line) {
        const cleanLine = line.trim();
        if (!cleanLine) return null;

        for (const pattern of this.menuPatterns) {
            const match = cleanLine.match(pattern);
            if (match) {
                const key = match[1].trim();
                if (!this.isValidMenuKey(key)) continue;

                const isNumber = /^\d+$/.test(key);
                menuLogger.log(`Detected menu option: [${key}] ${match[2].trim()}`);
                return {
                    key,
                    number: isNumber ? parseInt(key, 10) : null,
                    text: match[2].trim(),
                    isNumber
                };
            }
        }
        return null;
    },

    /**
     * Valida se chave é válida: números até 3 dígitos ou letra única
     * Rejeita: palavras longas (info, chat, warning)
     */
    isValidMenuKey(key) {
        if (key.length > this.maxKeyLength) return false;
        return /^\d+$/.test(key) || /^[a-zA-Z]$/.test(key);
    },

    /** Verifica se a linha é um prompt de seleção */
    isSelectionPrompt(line) {
        return this.promptPatterns.some(pattern => pattern.test(line));
    },

    /**
     * Processa uma nova linha recebida
     * @param {string} line - Linha de texto
     * @param {HTMLElement} output - Elemento de output
     * @returns {boolean} - true se a linha faz parte de um menu
     */
    processLine(line, output) {
        const option = this.detectMenuOption(line);
        const isPrompt = this.isSelectionPrompt(line);

        // Se detectamos uma opção de menu
        if (option) {
            menuLogger.log(`Menu option added to buffer. Total: ${this.lineBuffer.length + 1}`);
            this.lineBuffer.push({ line, option, element: null });
            this.resetMenuTimer(output);
            return true;
        }

        // Se detectamos um prompt e temos opções no buffer
        if (isPrompt && this.lineBuffer.length > 0) {
            menuLogger.log(`Selection prompt detected with ${this.lineBuffer.length} options`);
            this.lineBuffer.push({ line, option: null, isPrompt: true, element: null });
            this.finalizeMenu(output);
            return true;
        }

        // Se há um buffer ativo mas a linha não corresponde
        if (this.lineBuffer.length > 0) {
            // Verifica se linha está vazia (pode ser separador)
            if (!line.trim()) {
                menuLogger.log(`Empty line detected, buffer has ${this.lineBuffer.length} options`);
                // Se temos opções suficientes, finaliza o menu
                if (this.lineBuffer.length >= this.minMenuOptions) {
                    this.resetMenuTimer(output);
                }
                return false;
            }
            // Linha não vazia e não é opção - pode ser o fim do menu
            menuLogger.log(`Non-menu line detected, will finalize if timeout expires`);
            this.resetMenuTimer(output);
        }

        return false;
    },

    /** Reseta o timer do menu */
    resetMenuTimer(output) {
        if (this.menuTimer) clearTimeout(this.menuTimer);

        this.menuTimer = setTimeout(() => {
            if (this.lineBuffer.length >= this.minMenuOptions && this.isValidMenuSequence()) {
                menuLogger.log(`Menu timeout - finalizing with ${this.lineBuffer.length} options`);
                this.finalizeMenu(output);
            } else {
                menuLogger.log(`Menu timeout - clearing buffer`);
                this.lineBuffer = [];
            }
        }, this.menuTimeout);
    },

    /**
     * Valida se as opções formam um menu válido
     * Verifica: quantidade mínima e consistência (todas números OU todas letras)
     */
    isValidMenuSequence() {
        const options = this.lineBuffer.filter(item => item.option).map(item => item.option);
        if (options.length < this.minMenuOptions) return false;

        const allNumbers = options.every(opt => opt.isNumber);
        const allLetters = options.every(opt => !opt.isNumber);

        if (!allNumbers && !allLetters) {
            menuLogger.log("Invalid menu: mixed numbers and letters");
            return false;
        }

        if (allNumbers) {
            const numbers = options.map(opt => opt.number).sort((a, b) => a - b);
            const range = numbers[numbers.length - 1] - numbers[0] + 1;
            // Aceita se os números estão próximos (gap máximo de 3)
            return range <= numbers.length + 3;
        }

        return true; // Aceita letras
    },

    /** Finaliza e renderiza o menu */
    finalizeMenu(output) {
        if (this.menuTimer) {
            clearTimeout(this.menuTimer);
            this.menuTimer = null;
        }

        if (this.lineBuffer.length === 0 || !this.isValidMenuSequence()) {
            this.lineBuffer = [];
            return;
        }

        // Remove elementos já inseridos no output
        this.lineBuffer.forEach(item => {
            if (item.element?.parentNode === output) {
                output.removeChild(item.element);
            }
        });

        // Cria e adiciona o container do menu
        const menuContainer = this.createMenuContainer(this.lineBuffer);
        output.appendChild(menuContainer);
        output.scrollTop = output.scrollHeight;

        // Armazena referência ao menu atual
        this.currentMenu = {
            container: menuContainer,
            options: this.lineBuffer.filter(item => item.option).map(item => item.option)
        };

        menuLogger.log("Menu created with", this.currentMenu.options.length, "options");

        this.lineBuffer = [];
        this.activateKeyboardShortcuts();
    },

    /** Cria o container HTML do menu */
    createMenuContainer(items) {
        const container = document.createElement("nav");
        container.className = "menu-container";
        container.setAttribute("role", "menu");
        container.setAttribute("aria-label", "Menu de opções interativas");

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
                optionButton.setAttribute("aria-label", `Opção ${item.option.key}: ${item.option.text}`);
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

    /** Ativa os atalhos de teclado para o menu */
    activateKeyboardShortcuts() {
        if (this.keyboardHandler) {
            document.removeEventListener("keydown", this.keyboardHandler);
        }

        this.keyboardHandler = (e) => {
            if (!this.currentMenu || !/^[a-zA-Z0-9]$/.test(e.key)) return;

            // Ignora se modal está aberto
            const loginModal = getElement(CONFIG.SELECTORS.loginModal);
            const confirmModal = getElement(CONFIG.SELECTORS.confirmModal);
            if (loginModal?.classList.contains(CONFIG.CLASSES.show) ||
                confirmModal?.classList.contains(CONFIG.CLASSES.show)) {
                return;
            }

            const validOption = this.currentMenu.options.find(opt =>
                opt.key.toLowerCase() === e.key.toLowerCase()
            );

            if (validOption) {
                e.preventDefault();
                this.selectOption(e.key);
            }
        };

        document.addEventListener("keydown", this.keyboardHandler);
    },

    /** Desativa o menu atual */
    deactivateMenu() {
        if (this.keyboardHandler) {
            document.removeEventListener("keydown", this.keyboardHandler);
            this.keyboardHandler = null;
        }

        if (this.currentMenu) {
            this.currentMenu.container.classList.add("menu-inactive");
            this.currentMenu.container.setAttribute("aria-disabled", "true");

            this.currentMenu.container.querySelectorAll(".menu-option").forEach(btn => {
                btn.disabled = true;
                btn.setAttribute("tabindex", "-1");
            });

            this.currentMenu = null;
        }

        menuLogger.log("Menu deactivated");
    },

    /** Limpa o buffer e desativa menus */
    reset() {
        if (this.menuTimer) {
            clearTimeout(this.menuTimer);
            this.menuTimer = null;
        }
        this.lineBuffer = [];
        this.deactivateMenu();
    }
};
