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
<<<<<<< HEAD
    // Buffer de digitação para opções multi-caractere
    inputBuffer: "",
    // Timer para processar buffer
    inputTimer: null,
    // Duração máxima das chaves no menu atual
    maxKeyLength: 1,
=======
    // Tamanho máximo da chave para ser considerado menu (evita [info], [chat], etc.)
    maxKeyLength: 3,

    // Buffer de entrada para capturar múltiplos dígitos
    inputBuffer: {
        value: "",
        timeout: null,
        element: null,
        maxDigits: CONFIG.MENU_MAX_OPTION_DIGITS || 3,
        bufferTimeoutMs: CONFIG.MENU_BUFFER_TIMEOUT_MS || 800
    },

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
>>>>>>> 4207e99a3eed0d5160bdb449c22a58b306b164da

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

<<<<<<< HEAD
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
=======
            // Verifica se é um dígito ou letra (a-z, A-Z, 0-9)
            if (/^[a-zA-Z0-9]$/.test(e.key)) {
                // Only intercept if the key contributes to a valid option or prefix
                const newBuffer = this.inputBuffer.value + e.key.toLowerCase();
                const hasMatch = this.currentMenu.options.some(opt =>
                    opt.key.toLowerCase().startsWith(newBuffer)
                );
                if (!hasMatch) return;

                e.preventDefault();
                e.stopPropagation();

                // For single-letter keys, select immediately without buffering
                if (/^[a-zA-Z]$/.test(e.key)) {
                    const exactMatch = this.currentMenu.options.find(opt =>
                        opt.key.toLowerCase() === newBuffer
                    );
                    if (exactMatch) {
                        this.selectOption(exactMatch.key);
                        return;
                    }
                }

                // Adiciona dígito ao buffer
                this.addToInputBuffer(e.key);
                return;
            }

            // Backspace para remover dígito
            if (e.key === "Backspace") {
                e.preventDefault();
                e.stopPropagation();
                this.removeFromInputBuffer();
                return;
            }

            // Enter para enviar o buffer atual
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                this.submitInputBuffer();
                return;
>>>>>>> 4207e99a3eed0d5160bdb449c22a58b306b164da
            }
        };

        document.addEventListener("keydown", this.keyboardHandler);
    },

<<<<<<< HEAD
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
        output.appendChild(menuContainer);
        output.scrollTop = output.scrollHeight;

        this.currentMenu = {
            container: menuContainer,
            options: payload.options
        };

        this.activateKeyboardShortcuts();
        menuLogger.log("Backend menu rendered with", payload.options.length, "options");
=======
    /** Adiciona um dígito ao buffer */
    addToInputBuffer(digit) {
        // Limita o tamanho do buffer
        if (this.inputBuffer.value.length >= this.inputBuffer.maxDigits) {
            menuLogger.warn("Input buffer full, max digits reached");
            return;
        }

        this.inputBuffer.value += digit.toLowerCase();
        menuLogger.log(`Buffer updated: [${this.inputBuffer.value}]`);

        // Reseta o timer
        this.resetInputBufferTimeout();

        // Atualiza UI
        this.updateBufferDisplay();

        // Valida se a opção existe
        const validOption = this.currentMenu.options.find(opt =>
            opt.key.toLowerCase() === this.inputBuffer.value
        );

        if (validOption) {
            // Opção encontrada - marca como ready
            this.inputBuffer.element?.classList.remove("invalid");
            this.inputBuffer.element?.classList.add("ready");
            menuLogger.log(`Option found: [${this.inputBuffer.value}] -> "${validOption.text}"`);
        } else {
            // Verifica se há opções que começam com o buffer
            const hasPrefix = this.currentMenu.options.some(opt =>
                opt.key.toLowerCase().startsWith(this.inputBuffer.value)
            );

            if (hasPrefix) {
                this.inputBuffer.element?.classList.remove("invalid");
                this.inputBuffer.element?.classList.remove("ready");
                menuLogger.log(`Prefix match for buffer: [${this.inputBuffer.value}]`);
            } else {
                // Nenhuma opção válida
                this.inputBuffer.element?.classList.add("invalid");
                menuLogger.warn(`No valid option for buffer: [${this.inputBuffer.value}]`);
            }
        }
    },

    /** Remove o último dígito do buffer */
    removeFromInputBuffer() {
        if (this.inputBuffer.value.length === 0) return;

        this.inputBuffer.value = this.inputBuffer.value.slice(0, -1);
        menuLogger.log(`Buffer updated: [${this.inputBuffer.value}]`);

        // Reseta o timer
        this.resetInputBufferTimeout();

        // Atualiza UI
        this.updateBufferDisplay();

        // Remove classes de validação
        if (this.inputBuffer.value.length === 0) {
            this.clearInputBuffer();
            return;
        }

        this.inputBuffer.element?.classList.remove("invalid", "ready");
    },

    /** Envia o buffer atual como seleção de menu */
    submitInputBuffer() {
        if (this.inputBuffer.value.length === 0) return;

        const validOption = this.currentMenu.options.find(opt =>
            opt.key.toLowerCase() === this.inputBuffer.value
        );

        if (validOption) {
            menuLogger.log(`Submitting from buffer: [${this.inputBuffer.value}]`);
            this.clearInputBuffer();
            this.selectOption(validOption.key);
        } else {
            menuLogger.warn(`Cannot submit invalid option: [${this.inputBuffer.value}]`);
            this.inputBuffer.element?.classList.add("invalid");
        }
    },

    /** Reseta o timer de timeout do buffer */
    resetInputBufferTimeout() {
        if (this.inputBuffer.timeout) {
            clearTimeout(this.inputBuffer.timeout);
        }

        this.inputBuffer.timeout = setTimeout(() => {
            menuLogger.log(`Buffer timeout, auto-submitting: [${this.inputBuffer.value}]`);
            this.submitInputBuffer();
        }, this.inputBuffer.bufferTimeoutMs);
    },

    /** Atualiza o display visual do buffer */
    updateBufferDisplay() {
        if (this.inputBuffer.value.length === 0) {
            if (this.inputBuffer.element) {
                this.inputBuffer.element.remove();
                this.inputBuffer.element = null;
            }
            return;
        }

        if (!this.inputBuffer.element) {
            this.inputBuffer.element = document.createElement("div");
            this.inputBuffer.element.className = "menu-input-buffer";
            document.body.appendChild(this.inputBuffer.element);
        }

        this.inputBuffer.element.textContent = `[${this.inputBuffer.value}]`;
    },

    /** Limpa o buffer de entrada */
    clearInputBuffer() {
        if (this.inputBuffer.timeout) {
            clearTimeout(this.inputBuffer.timeout);
            this.inputBuffer.timeout = null;
        }

        this.inputBuffer.value = "";

        if (this.inputBuffer.element) {
            this.inputBuffer.element.remove();
            this.inputBuffer.element = null;
        }

        menuLogger.log("Input buffer cleared");
>>>>>>> 4207e99a3eed0d5160bdb449c22a58b306b164da
    },

    /** Desativa o menu atual */
    deactivateMenu() {
        if (this.keyboardHandler) {
            document.removeEventListener("keydown", this.keyboardHandler);
            this.keyboardHandler = null;
        }

<<<<<<< HEAD
        // Limpa buffer e timer
        this.clearInputTimer();
        this.inputBuffer = "";
        this.maxKeyLength = 1;
        this.clearInputFeedback();
=======
        // Limpa o buffer de entrada
        this.clearInputBuffer();
>>>>>>> 4207e99a3eed0d5160bdb449c22a58b306b164da

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

    /** Desativa menus ativos */
    reset() {
<<<<<<< HEAD
=======
        if (this.menuTimer) {
            clearTimeout(this.menuTimer);
            this.menuTimer = null;
        }
        this.lineBuffer = [];
        this.clearInputBuffer();
>>>>>>> 4207e99a3eed0d5160bdb449c22a58b306b164da
        this.deactivateMenu();
    }
};
