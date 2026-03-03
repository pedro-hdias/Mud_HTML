/**
 * ui.js (refatorado) - Interface do usuário
 * Contém função auxiliar para mostrar modal de confirmação e renderização básica
 * Event listeners movidos para events.js
 */

const uiLogger = createLogger("ui");

/**
 * Mapa de códigos ANSI SGR para cores CSS.
 * Suporta cores padrão (30–37, 90–97) e reset (0).
 */
const ANSI_COLOR_MAP = {
    "30": "#000", "31": "#c00", "32": "#0a0", "33": "#ca0",
    "34": "#44f", "35": "#c0c", "36": "#0cc", "37": "#ccc",
    "90": "#666", "91": "#f66", "92": "#6f6", "93": "#ff6",
    "94": "#66f", "95": "#f6f", "96": "#6ff", "97": "#fff"
};

/**
 * Converte texto com códigos ANSI em fragmento DOM com <span style="color:...">.
 * Retorna o DocumentFragment pronto para appendChild.
 */
function parseAnsiToFragment(text) {
    // Regex para sequências ANSI CSI SGR: ESC[ ... m
    const ansiRegex = /\x1b\[(\d+(?:;\d+)*)m/g;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let currentColor = null;
    let match;

    while ((match = ansiRegex.exec(text)) !== null) {
        // Texto antes da sequência
        if (match.index > lastIndex) {
            const span = document.createElement("span");
            if (currentColor) span.style.color = currentColor;
            span.textContent = text.slice(lastIndex, match.index);
            fragment.appendChild(span);
        }

        // Processa os códigos SGR
        const codes = match[1].split(";");
        for (const code of codes) {
            if (code === "0" || code === "") {
                currentColor = null; // reset
            } else if (ANSI_COLOR_MAP[code]) {
                currentColor = ANSI_COLOR_MAP[code];
            }
            // Ignora bold (1), underline (4), etc. silenciosamente
        }
        lastIndex = match.index + match[0].length;
    }

    // Texto restante
    if (lastIndex < text.length) {
        const span = document.createElement("span");
        if (currentColor) span.style.color = currentColor;
        span.textContent = text.slice(lastIndex);
        fragment.appendChild(span);
    }

    // Se não tinha nenhum ANSI, retorna null para usar textContent (mais rápido)
    if (fragment.childNodes.length === 0) return null;
    return fragment;
}

/**
 * Detecta se o texto contém sequências ANSI
 */
function hasAnsiCodes(text) {
    return text.includes("\x1b[");
}

const UIHelpers = {
    _scrollRafId: null,
    _trimTimeoutId: null,

    /**
     * Agenda scroll para o fim do output usando rAF.
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
     * Agenda trimagem com debounce para evitar múltiplas operações DOM
     * e reanúncios desnecessários do leitor de tela
     */
    /**
     * Gerencia lazy-loader de histórico
     * Garante que existe um elemento para carregar histórico
     */
    ensureHistoryLoader(output) {
        if (!output) {
            uiLogger.error("ensureHistoryLoader called with no output element");
            return;
        }

        // Verifica se já existe um loader
        let loader = output.querySelector('.history-loader');
        if (loader) {
            uiLogger.log("History loader already exists in DOM");
            return loader;
        }

        uiLogger.log("Creating new history loader element");

        // Cria novo loader
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
     * Marca que estamos carregando histórico
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
     * Adiciona histórico ao loader
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

        // Divide conteúdo em linhas
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
     * Atualiza estado do loader
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
            loader.setAttribute('disabled', 'disabled');
        }
    },
    addSystemMessage(message, color = null) {
        const output = getElement(CONFIG.SELECTORS.output);
        const announcer = getElement(CONFIG.SELECTORS.screenReaderAnnouncer);
        if (!output) return;

        const sysMsg = document.createElement("div");
        sysMsg.className = CONFIG.CLASSES.systemMessage;
        if (color) sysMsg.style.color = color;
        sysMsg.textContent = message;

        // Add to visible output
        output.appendChild(sysMsg);

        // Add to screen reader announcer (no limit, keeps all)
        if (announcer) {
            const announceLine = document.createElement("div");
            announceLine.textContent = message;
            announcer.appendChild(announceLine);
        }

        // Trim output to max lines
        if (output.children.length > CONFIG.OUTPUT_MAX_LINES) {
            const toRemove = output.children.length - CONFIG.OUTPUT_MAX_LINES;
            for (let i = 0; i < toRemove; i++) {
                if (output.firstChild) {
                    output.removeChild(output.firstChild);
                }
            }
        }

        this._scheduleScrollToBottom(output);
    },
    appendOutputLine(text, options = {}) {
        const output = getElement(CONFIG.SELECTORS.output);
        const announcer = getElement(CONFIG.SELECTORS.screenReaderAnnouncer);
        if (!output) return;

        const lineEl = document.createElement("div");
        const classNames = [CONFIG.CLASSES.outputLine];
        if (options.isHistory) {
            classNames.push(CONFIG.CLASSES.history);
        } else if (options.isNew !== false) {
            classNames.push(CONFIG.CLASSES.new);
        }
        lineEl.className = classNames.join(" ");

        // Parse ANSI if present, otherwise textContent (faster)
        if (hasAnsiCodes(text)) {
            const fragment = parseAnsiToFragment(text);
            if (fragment) {
                lineEl.appendChild(fragment);
            } else {
                lineEl.textContent = text;
            }
        } else {
            lineEl.textContent = text;
        }

        // Add to visible output
        output.appendChild(lineEl);

        // If it's a new line (not history), add to screen reader announcer (no limit)
        if (!options.isHistory && announcer) {
            const announceLine = document.createElement("div");
            announceLine.textContent = text;
            announcer.appendChild(announceLine);
        }

        if (output.children.length > CONFIG.OUTPUT_MAX_LINES) {
            const toRemove = output.children.length - CONFIG.OUTPUT_MAX_LINES;
            for (let i = 0; i < toRemove; i++) {
                if (output.firstChild) {
                    output.removeChild(output.firstChild);
                }
            }
        }

        this._scheduleScrollToBottom(output);
    },
    appendHistoryBlock(content, options = {}) {
        const output = getElement(CONFIG.SELECTORS.output);
        if (!output) return;

        const isRecent = options.isRecent || false;

        const lines = content.split(/\r?\n/);
        const maxHistoryLines = CONFIG.OUTPUT_HISTORY_MAX_LINES || CONFIG.OUTPUT_MAX_LINES;
        const startIndex = Math.max(0, lines.length - maxHistoryLines);

        lines.slice(startIndex).forEach((line, idx, arr) => {
            if (line || idx < arr.length - 1) {
                const lineEl = document.createElement("div");
                lineEl.className = `${CONFIG.CLASSES.outputLine} ${CONFIG.CLASSES.history}`;
                lineEl.textContent = line;
                lineEl.setAttribute('tabindex', '0');
                lineEl.setAttribute('role', 'article');
                lineEl.setAttribute('aria-label', `História: ${line.substring(0, 50)}`);
                output.appendChild(lineEl);
            }
        });

        // Trim output to max lines
        if (output.children.length > CONFIG.OUTPUT_MAX_LINES) {
            const toRemove = output.children.length - CONFIG.OUTPUT_MAX_LINES;
            for (let i = 0; i < toRemove; i++) {
                if (output.firstChild) {
                    output.removeChild(output.firstChild);
                }
            }
        }

        this._scheduleScrollToBottom(output);
    },

    setButtonsState({
        loginVisible,
        disconnectVisible,
        sendDisabled,
        inputDisabled
    }) {
        const btnLogin = getElement(CONFIG.SELECTORS.btnLogin);
        const btnDisconnect = getElement(CONFIG.SELECTORS.btnDisconnect);
        const btnSend = getElement(CONFIG.SELECTORS.btnSend);
        const input = getElement(CONFIG.SELECTORS.input);

        if (typeof loginVisible === "boolean" && btnLogin) {
            if (loginVisible) {
                btnLogin.classList.add(CONFIG.CLASSES.show);
                btnLogin.classList.remove('hidden');
            } else {
                btnLogin.classList.remove(CONFIG.CLASSES.show);
                btnLogin.classList.add('hidden');
            }
        }
        if (typeof disconnectVisible === "boolean" && btnDisconnect) {
            if (disconnectVisible) {
                btnDisconnect.classList.add(CONFIG.CLASSES.show);
                btnDisconnect.classList.remove('hidden');
            } else {
                btnDisconnect.classList.remove(CONFIG.CLASSES.show);
                btnDisconnect.classList.add('hidden');
            }
        }
        if (typeof sendDisabled === "boolean" && btnSend) btnSend.disabled = sendDisabled;
        if (typeof inputDisabled === "boolean" && input) input.disabled = inputDisabled;
    },

    setMainContentVisibility(visible) {
        const mainContent = document.getElementById("mainContent");
        const inputArea = document.getElementById("inputArea");
        const reconnectStatus = getElement(CONFIG.SELECTORS.reconnectStatus);

        if (mainContent) {
            if (visible) {
                mainContent.classList.add(CONFIG.CLASSES.show);
                mainContent.classList.remove('hidden');
            } else {
                mainContent.classList.remove(CONFIG.CLASSES.show);
                mainContent.classList.add('hidden');
            }
        }
        if (inputArea) {
            if (visible) {
                inputArea.classList.add(CONFIG.CLASSES.show);
                inputArea.classList.remove('hidden');
            } else {
                inputArea.classList.remove(CONFIG.CLASSES.show);
                inputArea.classList.add('hidden');
            }
        }
        if (reconnectStatus) {
            if (!visible) {
                reconnectStatus.classList.add('hidden');
                reconnectStatus.classList.remove(CONFIG.CLASSES.show);
            } else {
                reconnectStatus.classList.remove('hidden');
                reconnectStatus.classList.add(CONFIG.CLASSES.show);
            }
        }
    },

    setMenuContainerVisibility(visible) {
        const menuContainer = document.getElementById("menuContainer");
        if (menuContainer) {
            if (visible) {
                menuContainer.classList.add(CONFIG.CLASSES.show);
                menuContainer.classList.remove('hidden');
            } else {
                menuContainer.classList.remove(CONFIG.CLASSES.show);
                menuContainer.classList.add('hidden');
            }
        }
    },

    setStatusIndicator({ text, stateClass }) {
        const statusDot = getElement(CONFIG.SELECTORS.statusDot);
        const statusText = getElement(CONFIG.SELECTORS.statusText);

        if (statusDot) statusDot.className = "";
        if (stateClass && statusDot) statusDot.classList.add(stateClass);
        if (typeof text === "string" && statusText) statusText.textContent = text;

        // Favicon dinâmico: altera cor do círculo SVG conforme estado
        this._updateFavicon(stateClass);
    },

    /**
     * Atualiza o favicon SVG com a cor correspondente ao estado.
     */
    _updateFavicon(stateClass) {
        const favicon = document.getElementById("favicon");
        if (!favicon) return;
        let color = "%23666"; // cinza (desconectado)
        if (stateClass === CONFIG.CLASSES.connected) color = "%2328a745"; // verde
        else if (stateClass === CONFIG.CLASSES.connecting) color = "%23ffc107"; // amarelo
        favicon.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='${color}'/></svg>`;
    },

    /**
     * UX #3: Mostra latência no indicador de status.
     */
    showLatency(ms) {
        const statusText = getElement(CONFIG.SELECTORS.statusText);
        if (!statusText) return;
        // Só mostra se conectado
        if (StateStore.getConnectionState() === "CONNECTED") {
            statusText.textContent = `Connected (${ms}ms)`;
        }
    },

    /**
     * UX #5: Flash visual no input ao enviar comando.
     */
    flashInput() {
        const input = getElement(CONFIG.SELECTORS.input);
        if (!input) return;
        input.classList.add("input-flash");
        setTimeout(() => input.classList.remove("input-flash"), 200);
    },

    setReconnectControls({ visible }) {
        const reconnectStatus = getElement(CONFIG.SELECTORS.reconnectStatus);
        if (!reconnectStatus) return;

        if (visible) {
            reconnectStatus.classList.add(CONFIG.CLASSES.show);
            reconnectStatus.classList.remove('hidden');
        } else {
            reconnectStatus.classList.remove(CONFIG.CLASSES.show);
            reconnectStatus.classList.add('hidden');
        }
    }
};

// ===== DEBUG UTILITIES =====
// Função de debug global para testar o botão de histórico
window.debugForceHistoryButton = function () {
    const output = getElement(CONFIG.SELECTORS.output);
    if (!output) {
        console.error("❌ Output element not found");
        return;
    }

    console.log("🔧 Forcing history button to appear...");
    const loader = UIHelpers.ensureHistoryLoader(output);
    UIHelpers.updateHistoryLoaderState(output, true, 0);

    console.log("✅ History button created:", {
        element: loader,
        inDOM: document.contains(loader),
        display: window.getComputedStyle(loader).display,
        visibility: window.getComputedStyle(loader).visibility,
        position: loader.getBoundingClientRect()
    });

    return loader;
};

// ===== END DEBUG =====

// Exporta UIHelpers para o escopo global (usado por ws.js e outros)
window.UIHelpers = UIHelpers;

/**
 * Mostra o modal de confirmação
 * @param {string} message - Mensagem a exibir
 */
function showConfirmModal(message) {
    ModalManager.showConfirmModal(message);
}

/**
 * Esconde o modal de confirmação
 */
function hideConfirmModal() {
    ModalManager.hideConfirmModal();
}
