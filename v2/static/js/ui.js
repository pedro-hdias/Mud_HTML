/**
 * ui.js (refatorado) - Interface do usuário
 * Contém função auxiliar para mostrar modal de confirmação e renderização básica
 * Event listeners movidos para events.js
 */

const uiLogger = createLogger("ui");

const UIHelpers = {
    trimOutputLines(output, maxLines) {
        if (!output) return;
        let totalLines = output.children.length;
        if (totalLines <= maxLines) return;

        const toRemove = totalLines - maxLines;
        for (let i = 0; i < toRemove; i++) {
            if (output.firstChild) {
                output.removeChild(output.firstChild);
            }
        }
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

        output.scrollTop = output.scrollHeight;
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
        lineEl.textContent = text;
        output.appendChild(lineEl);

        this.trimOutputLines(output, CONFIG.OUTPUT_MAX_LINES);
        output.scrollTop = output.scrollHeight;
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
        output.scrollTop = output.scrollHeight;
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
