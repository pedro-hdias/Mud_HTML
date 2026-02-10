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

    trimOutputLines(output, maxLines) {
        if (!output) return;
        const totalLines = output.children.length;
        if (totalLines <= maxLines) return;

        const toRemove = totalLines - maxLines;

        // Range API: remoção em lote causa um único reflow
        // em vez de N reflows com removeChild() em loop
        const range = document.createRange();
        range.setStartBefore(output.firstChild);
        range.setEndAfter(output.children[toRemove - 1]);
        range.deleteContents();
    },
    appendSystemMessage(message, color) {
        const output = getElement(CONFIG.SELECTORS.output);
        if (!output) return;

        const sysMsg = document.createElement("div");
        sysMsg.className = CONFIG.CLASSES.systemMessage;
        if (color) sysMsg.style.color = color;
        sysMsg.textContent = message;
        output.appendChild(sysMsg);

        this.trimOutputLines(output, CONFIG.OUTPUT_MAX_LINES);

        this._scheduleScrollToBottom(output);
    },
    appendOutputLine(text, options = {}) {
        const output = getElement(CONFIG.SELECTORS.output);
        if (!output) return;

        const lineEl = document.createElement("div");
        const classNames = [CONFIG.CLASSES.outputLine];
        if (options.isHistory) {
            classNames.push(CONFIG.CLASSES.history);
        } else if (options.isNew !== false) {
            classNames.push(CONFIG.CLASSES.new);
        }
        lineEl.className = classNames.join(" ");

        // Parsear ANSI se presente, senão textContent (mais rápido)
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

        output.appendChild(lineEl);

        this.trimOutputLines(output, CONFIG.OUTPUT_MAX_LINES);
        this._scheduleScrollToBottom(output);
    },
    appendHistoryBlock(content) {
        const output = getElement(CONFIG.SELECTORS.output);
        if (!output) return;

        const historyContainer = document.createElement("div");
        historyContainer.className = CONFIG.CLASSES.historyBlock;

        const lines = content.split(/\r?\n/);
        const maxHistoryLines = CONFIG.OUTPUT_HISTORY_MAX_LINES || CONFIG.OUTPUT_MAX_LINES;
        const startIndex = Math.max(0, lines.length - maxHistoryLines);

        lines.slice(startIndex).forEach((line, idx, arr) => {
            if (line || idx < arr.length - 1) {
                const lineEl = document.createElement("div");
                lineEl.className = `${CONFIG.CLASSES.outputLine} ${CONFIG.CLASSES.history}`;
                lineEl.textContent = line;
                historyContainer.appendChild(lineEl);
            }
        });

        output.appendChild(historyContainer);
        this.trimOutputLines(output, CONFIG.OUTPUT_MAX_LINES);
        this._scheduleScrollToBottom(output);
    },

    setButtonsState({
        loginDisabled,
        disconnectDisabled,
        sendDisabled,
        inputDisabled
    }) {
        const btnLogin = getElement(CONFIG.SELECTORS.btnLogin);
        const btnDisconnect = getElement(CONFIG.SELECTORS.btnDisconnect);
        const btnSend = getElement(CONFIG.SELECTORS.btnSend);
        const input = getElement(CONFIG.SELECTORS.input);

        if (typeof loginDisabled === "boolean" && btnLogin) btnLogin.disabled = loginDisabled;
        if (typeof disconnectDisabled === "boolean" && btnDisconnect) btnDisconnect.disabled = disconnectDisabled;
        if (typeof sendDisabled === "boolean" && btnSend) btnSend.disabled = sendDisabled;
        if (typeof inputDisabled === "boolean" && input) input.disabled = inputDisabled;
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
            statusText.textContent = `Conectado (${ms}ms)`;
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

        reconnectStatus.hidden = !visible;
    }
};

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
