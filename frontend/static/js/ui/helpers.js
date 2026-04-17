/**
 * ui/helpers.js - Funções auxiliares de UI
 * Contém: scroll agendado, loader de histórico, clearOutput, setInputSecure, flashInput.
 * Mesclados em UIHelpers via Object.assign em ui/index.js.
 * Depende de: config.js (CONFIG, getElement), ui/output.js (uiLogger)
 */

const _UIHelperMethods = {
    _scrollRafId: null,
    _trimTimeoutId: null,

    _clampHistoryBatchSize(value) {
        const min = CONFIG.HISTORY_REQUEST?.MIN ?? 1;
        const max = CONFIG.OUTPUT_HISTORY_MAX_LINES ?? 2000;
        const fallback = CONFIG.HISTORY_REQUEST?.DEFAULT ?? 50;
        const parsed = parseInt(value, 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, parsed));
    },

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

        const outputSection = document.getElementById('outputSection') || output.parentElement;
        if (!outputSection) {
            uiLogger.error("History loader container not found");
            return;
        }

        const existingLoaders = Array.from(outputSection.querySelectorAll('.history-loader'));
        if (existingLoaders.length > 0) {
            const [primaryLoader, ...duplicateLoaders] = existingLoaders;
            if (duplicateLoaders.length > 0) {
                duplicateLoaders.forEach((duplicateLoader) => duplicateLoader.remove());
                uiLogger.warn(`Removed ${duplicateLoaders.length} duplicate history loader(s)`);
            }

            uiLogger.log("History loader already exists in DOM");
            return primaryLoader;
        }

        uiLogger.log("Creating new history loader element");

        loader = document.createElement('details');
        loader.className = 'history-loader';
        loader.open = true;
        loader.dataset.fromLineIndex = String(CONFIG.HISTORY_REQUEST?.DEFAULT ?? 50);
        loader.dataset.hasMore = 'true';

        const initialBatchSize = (typeof StorageManager !== "undefined" && typeof StorageManager.getHistoryBatchSize === "function")
            ? StorageManager.getHistoryBatchSize()
            : (CONFIG.HISTORY_REQUEST?.DEFAULT ?? 50);
        loader.dataset.batchSize = String(this._clampHistoryBatchSize(initialBatchSize));

        // Sincroniza buffer visível com o valor salvo imediatamente
        CONFIG.OUTPUT_MAX_LINES = this._clampHistoryBatchSize(initialBatchSize);

        const summary = document.createElement('summary');
        summary.className = 'history-loader-summary';
        summary.setAttribute('aria-label', 'Load more history');

        const controls = document.createElement('div');
        controls.className = 'history-loader-controls';
        controls.setAttribute('role', 'group');
        controls.setAttribute('aria-label', 'Visible history lines on screen');

        const decButton = document.createElement('button');
        decButton.type = 'button';
        decButton.className = 'history-lines-btn';
        decButton.textContent = `-${CONFIG.HISTORY_REQUEST.DELTA_BUTTON}`;
        decButton.setAttribute('aria-label', `Decrease visible history by ${CONFIG.HISTORY_REQUEST.DELTA_BUTTON} lines`);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'history-lines-slider';
        slider.min = String(CONFIG.HISTORY_REQUEST.MIN);
        slider.max = String(CONFIG.OUTPUT_HISTORY_MAX_LINES ?? 2000);
        slider.step = String(CONFIG.HISTORY_REQUEST.STEP);
        slider.value = loader.dataset.batchSize;
        slider.setAttribute('aria-label', 'Visible history lines');

        const incButton = document.createElement('button');
        incButton.type = 'button';
        incButton.className = 'history-lines-btn';
        incButton.textContent = `+${CONFIG.HISTORY_REQUEST.DELTA_BUTTON}`;
        incButton.setAttribute('aria-label', `Increase visible history by ${CONFIG.HISTORY_REQUEST.DELTA_BUTTON} lines`);

        const syncBatchSize = (rawValue) => {
            const next = this._clampHistoryBatchSize(rawValue);
            loader.dataset.batchSize = String(next);
            slider.value = String(next);
            if (typeof StorageManager !== "undefined" && typeof StorageManager.setHistoryBatchSize === "function") {
                StorageManager.setHistoryBatchSize(next);
            }
            // Atualiza o buffer de saída visível dinamicamente
            CONFIG.OUTPUT_MAX_LINES = next;

            // Soft warning de performance (não bloqueia)
            if (next > 200 && loader.dataset.performanceWarned !== 'true') {
                loader.dataset.performanceWarned = 'true';
                this.addSystemMessage('[SYSTEM] Showing more than 200 history lines may impact performance.', '#ff9800');
            } else if (next <= 200) {
                loader.dataset.performanceWarned = 'false';
            }
        };

        // Impede que interação nos controles dispare o clique do summary.
        controls.addEventListener('click', (event) => {
            event.stopPropagation();
        });
        // mousedown: apenas stopPropagation (sem preventDefault) para não bloquear o drag do slider.
        controls.addEventListener('mousedown', (event) => { event.stopPropagation(); });
        controls.addEventListener('keydown', (event) => {
            event.stopPropagation();
        });

        decButton.addEventListener('click', () => {
            const current = this._clampHistoryBatchSize(loader.dataset.batchSize);
            syncBatchSize(current - (CONFIG.HISTORY_REQUEST.DELTA_BUTTON ?? 10));
        });

        incButton.addEventListener('click', () => {
            const current = this._clampHistoryBatchSize(loader.dataset.batchSize);
            syncBatchSize(current + (CONFIG.HISTORY_REQUEST.DELTA_BUTTON ?? 10));
        });

        slider.addEventListener('input', () => {
            syncBatchSize(slider.value);
        });

        controls.appendChild(decButton);
        controls.appendChild(slider);
        controls.appendChild(incButton);

        const loaderText = document.createElement('span');
        loaderText.className = 'loader-text';
        loaderText.textContent = 'Load more history';

        summary.appendChild(loaderText);
        loader.appendChild(summary);
        loader.appendChild(controls);

        syncBatchSize(loader.dataset.batchSize);

        const content = document.createElement('div');
        content.className = 'history-loader-content';
        loader.appendChild(content);

        if (outputSection) {
            outputSection.insertBefore(loader, output);
        } else {
            output.insertBefore(loader, output.firstChild);
        }

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
            lineEl.setAttribute('aria-label', `History: ${line.substring(0, 50)}`);
            content.insertBefore(lineEl, content.firstChild);
        });

        // Atualiza contador
        const textSpan = loader.querySelector('.loader-text');
        if (textSpan) {
            const count = content.querySelectorAll('.' + CONFIG.CLASSES.outputLine).length;
            const total = parseInt(loader.dataset.totalLines || '0', 10);
            textSpan.textContent = total > 0
                ? `Load more history (${count}/${total})`
                : `Load more history (${count})`;
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

        const textSpan = loader.querySelector('.loader-text');
        const summary = loader.querySelector('summary');

        if (!hasMore) {
            if (textSpan) {
                // Se fromLineIndex === 0 e não há conteúdo carregado ainda, é o estado inicial
                const hasLoadedContent = loader.querySelectorAll('.output-line').length > 0;
                textSpan.textContent = hasLoadedContent
                    ? 'Load more history (all loaded)'
                    : 'Load more history';
            }
            loader.classList.add('history-loader--disabled');
            if (summary) summary.setAttribute('aria-disabled', 'true');
        } else {
            loader.classList.remove('history-loader--disabled');
            if (summary) summary.setAttribute('aria-disabled', 'false');
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
            // Preserva o valor atual para evitar perda de digitação em prompts fragmentados.
            const currentValue = input.value;
            input.setAttribute("autocomplete", "current-password");
            input.setAttribute("autocapitalize", "off");
            input.setAttribute("autocorrect", "off");
            input.setAttribute("spellcheck", "false");
            input.type = "password";
            input.value = currentValue;
            const secureAriaLabel = input.dataset.secureAriaLabel || "Enter password (hidden)";
            input.setAttribute("aria-label", secureAriaLabel);
            const securePlaceholder = input.dataset.securePlaceholder || "Enter password...";
            input.placeholder = securePlaceholder;
            input.removeAttribute("aria-describedby");
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
            input.removeAttribute("autocapitalize");
            input.removeAttribute("autocorrect");
            input.removeAttribute("spellcheck");
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
