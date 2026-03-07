/**
 * ui/helpers.js - Funções auxiliares de UI
 * Contém: scroll agendado, loader de histórico, clearOutput, setInputSecure, flashInput.
 * Mesclados em UIHelpers via Object.assign em ui/index.js.
 * Depende de: config.js (CONFIG, getElement), ui/output.js (uiLogger)
 */

const _UIHelperMethods = {
    _scrollRafId: null,
    _trimTimeoutId: null,

    /**
     * Agenda scroll para o fim do output usando requestAnimationFrame.
     * Múltiplas chamadas dentro do mesmo frame são agrupadas.
     */
    _scheduleScrollToBottom(output) {
        if (!output) return;
        if (this._scrollRafId) return; // já agendado
        this._scrollRafId = requestAnimationFrame(() => {
            this._scrollRafId = null;
            output.scrollTop = output.scrollHeight;
        });
    },

    /**
     * Garante que existe um elemento de lazy-loader de histórico no output.
     */
    ensureHistoryLoader(output) {
        if (!output) {
            uiLogger.error("ensureHistoryLoader called with no output element");
            return;
        }

        let loader = output.querySelector('.history-loader');
        if (loader) {
            uiLogger.log("History loader already exists in DOM");
            return loader;
        }

        uiLogger.log("Creating new history loader element");

        loader = document.createElement('details');
        loader.className = 'history-loader';
        loader.dataset.fromLineIndex = '25';
        loader.dataset.hasMore = 'true';

        const summary = document.createElement('summary');
        summary.innerHTML = '<span class="loader-text">📖 Load older messages (0 linhas)</span>';
        summary.setAttribute('tabindex', '0');
        summary.setAttribute('role', 'button');
        summary.setAttribute('aria-label', 'Carregar mensagens antigas');
        loader.appendChild(summary);

        const content = document.createElement('div');
        content.className = 'history-loader-content';
        loader.appendChild(content);

        output.insertBefore(loader, output.firstChild);

        uiLogger.log("✅ History loader created and inserted:", {
            loader,
            parent: loader.parentElement,
            display: window.getComputedStyle(loader).display,
            visibility: window.getComputedStyle(loader).visibility
        });

        return loader;
    },

    /**
     * Marca estado de carregamento no loader de histórico.
     */
    setHistoryLoading(output, isLoading) {
        const loader = this.ensureHistoryLoader(output);
        if (!loader) return;

        const content = loader.querySelector('.history-loader-content');
        if (!content) return;

        if (isLoading) {
            const spinner = content.querySelector('.loader-spinner');
            if (!spinner) {
                const sp = document.createElement('div');
                sp.className = 'loader-spinner';
                sp.textContent = 'Loading...';
                content.appendChild(sp);
            }
        }
    },

    /**
     * Adiciona linhas de histórico ao loader.
     */
    appendHistoryToLoader(output, historyContent) {
        const loader = this.ensureHistoryLoader(output);
        if (!loader) return;

        const content = loader.querySelector('.history-loader-content');
        if (!content) {
            uiLogger.error("History loader content div not found");
            return;
        }

        // Remove spinner
        const spinner = content.querySelector('.loader-spinner');
        if (spinner) spinner.remove();

        const lines = historyContent.split('\n').filter(l => l.length > 0);
        uiLogger.log(`Adding ${lines.length} lines to history loader`);

        lines.forEach(line => {
            const lineEl = document.createElement('div');
            lineEl.className = CONFIG.CLASSES.outputLine + ' ' + CONFIG.CLASSES.history;
            lineEl.textContent = line;
            lineEl.setAttribute('tabindex', '0');
            lineEl.setAttribute('role', 'article');
            lineEl.setAttribute('aria-label', `História: ${line.substring(0, 50)}`);
            content.insertBefore(lineEl, content.firstChild);
        });

        // Atualiza contador
        const textSpan = loader.querySelector('.loader-text');
        if (textSpan) {
            const count = content.querySelectorAll('.' + CONFIG.CLASSES.outputLine).length;
            textSpan.textContent = `📖 Load older messages (${count} linhas)`;
            uiLogger.log(`Updated history loader counter: ${count} lines`);
        }
    },

    /**
     * Atualiza estado (hasMore, fromLineIndex) do loader de histórico.
     */
    updateHistoryLoaderState(output, hasMore, fromLineIndex) {
        const loader = this.ensureHistoryLoader(output);
        if (!loader) return;

        loader.dataset.hasMore = hasMore ? 'true' : 'false';
        loader.dataset.fromLineIndex = fromLineIndex;

        if (!hasMore) {
            const summary = loader.querySelector('summary');
            if (summary) {
                summary.textContent = '🎯 All history loaded';
            }
            loader.classList.add('history-loader--disabled');
            loader.setAttribute('aria-disabled', 'true');
        } else {
            loader.classList.remove('history-loader--disabled');
            loader.removeAttribute('aria-disabled');
        }
    },

    /**
     * Limpa o histórico de mensagens e o anunciador de leitor de tela.
     */
    clearOutput() {
        const output = getElement(CONFIG.SELECTORS.output);
        const announcer = getElement(CONFIG.SELECTORS.screenReaderAnnouncer);

        if (output) {
            output.innerHTML = "";
            uiLogger.log("Output cleared");
        }
        if (announcer) {
            announcer.innerHTML = "";
            uiLogger.log("Screen reader announcer cleared");
        }
    },

    /**
     * Alterna o tipo do input entre "password" e "text".
     * Preserva placeholder e atributos ARIA originais.
     * @param {boolean} secure - true para entrada segura, false para texto normal
     */
    setInputSecure(secure) {
        const input = getElement(CONFIG.SELECTORS.input);
        if (!input) return;

        // Salva configurações originais usando dataset
        if (!input.dataset.originalType) {
            input.dataset.originalType = input.type || "text";
        }
        if (!input.dataset.originalPlaceholder) {
            input.dataset.originalPlaceholder = input.placeholder || "";
        }
        if (!input.dataset.originalAriaLabel) {
            input.dataset.originalAriaLabel = input.getAttribute("aria-label") || "";
        }
        if (!input.dataset.originalAriaDescribedby) {
            input.dataset.originalAriaDescribedby = input.getAttribute("aria-describedby") || "";
        }

        // Evita atualizações desnecessárias se já no estado correto
        if (secure === (input.type === "password")) return;

        if (secure) {
            input.type = "password";
            const secureAriaLabel = input.dataset.secureAriaLabel || "Enter password (hidden)";
            input.setAttribute("aria-label", secureAriaLabel);
            const securePlaceholder = input.dataset.securePlaceholder || "Enter password...";
            input.placeholder = securePlaceholder;
            input.removeAttribute("aria-describedby");
            input.setAttribute("autocomplete", "current-password");
        } else {
            input.type = input.dataset.originalType || "text";

            const originalAriaLabel = input.dataset.originalAriaLabel || "";
            if (originalAriaLabel) {
                input.setAttribute("aria-label", originalAriaLabel);
            } else {
                input.removeAttribute("aria-label");
            }

            const originalPlaceholder = input.dataset.originalPlaceholder || "";
            if (originalPlaceholder) {
                input.placeholder = originalPlaceholder;
            } else {
                input.removeAttribute("placeholder");
            }

            const originalAriaDescribedby = input.dataset.originalAriaDescribedby || "";
            if (originalAriaDescribedby) {
                input.setAttribute("aria-describedby", originalAriaDescribedby);
            } else {
                input.removeAttribute("aria-describedby");
            }
            input.removeAttribute("autocomplete");
        }
    },

    /**
     * Flash visual no input ao enviar um comando.
     */
    flashInput() {
        const input = getElement(CONFIG.SELECTORS.input);
        if (!input) return;
        input.classList.add("input-flash");
        setTimeout(() => input.classList.remove("input-flash"), 200);
    }
};
