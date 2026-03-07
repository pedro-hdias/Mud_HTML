/**
 * menu/controller.js - MenuManager: coordenador do ciclo de vida dos menus
 * Mescla todos os grupos de métodos dos submódulos em MenuManager.
 * Depende de: menu/parser.js, menu/state.js, menu/renderer.js,
 *             ui/index.js (UIHelpers), ws.js (sendCommand)
 */

const MenuManager = Object.assign(
    {
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
        // Comprimento máximo das chaves no menu atual
        maxKeyLength: 1
    },
    _MenuRendererMethods,
    _MenuStateMethods,
    {
        /** Seleciona uma opção do menu e envia o comando correspondente. */
        selectOption(optionKey) {
            if (!this.currentMenu) return;

            const keyStr = optionKey.toString().toLowerCase();
            const validOption = this.currentMenu.options.find(opt => opt.key.toLowerCase() === keyStr);

            if (!validOption) {
                menuLogger.warn("Invalid option key:", optionKey);
                return;
            }

            menuLogger.log("Option selected:", validOption.key);

            // Marca a opção como selecionada visualmente
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

        /** Aborta o menu atual enviando comando de abort. */
        abortMenu() {
            if (!this.currentMenu) return;

            menuLogger.log("Menu aborted via ESC key");

            // Feedback visual de abort
            const feedback = document.createElement("div");
            feedback.className = "menu-input-feedback abort";
            feedback.setAttribute("role", "status");
            feedback.setAttribute("aria-live", "polite");
            feedback.textContent = "Menu cancelado (ESC)";

            if (this.currentMenu.container) {
                this.currentMenu.container.insertBefore(feedback, this.currentMenu.container.firstChild);

                setTimeout(() => {
                    if (feedback && feedback.parentNode) feedback.remove();
                }, 1500);
            }

            this.deactivateMenu();
            // 'a' é o comando padrão de abort em MUDs
            sendCommand("a");
        },

        /** Renderiza menu recebido do backend no container de menu. */
        renderBackendMenu(payload, output) {
            if (!validateMenuPayload(payload, this.minMenuOptions)) {
                menuLogger.warn("Invalid backend menu payload", payload);
                return;
            }

            this.deactivateMenu();

            const items = payload.options.map(option => ({ line: `[${option.key}] ${option.text}`, option }));
            if (payload.prompt) {
                items.push({ line: payload.prompt, option: null, isPrompt: true });
            }

            const menuContainer = this.createMenuContainer(items);

            // Renderiza no container separado (melhor acessibilidade)
            const menuRegion = document.getElementById("menuContainer");
            if (menuRegion) {
                menuRegion.innerHTML = "";
                menuRegion.appendChild(menuContainer);
                UIHelpers.setMenuContainerVisibility(true);
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

        /** Desativa o menu atual, remove listeners e limpa o DOM. */
        deactivateMenu() {
            if (this.keyboardHandler) {
                document.removeEventListener("keydown", this.keyboardHandler);
                this.keyboardHandler = null;
            }

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
                    UIHelpers.setMenuContainerVisibility(false);
                }

                this.currentMenu = null;
            }

            menuLogger.log("Menu deactivated");
        },

        /** Desativa menus ativos (alias de deactivateMenu). */
        reset() {
            this.deactivateMenu();
        }
    }
);
