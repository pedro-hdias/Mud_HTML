/**
 * ui/output.js - Renderização de output do MUD com suporte a ANSI
 * Contém: ANSI_COLOR_MAP, parseAnsiToFragment, hasAnsiCodes
 * e os métodos de output agrupados em _UIOutputMethods.
 * Depende de: config.js (CONFIG, getElement)
 */

// Logger compartilhado por todos os módulos do pacote ui/
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
 * Retorna o DocumentFragment pronto para appendChild, ou null se não houver ANSI.
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
 * Detecta se o texto contém sequências ANSI.
 */
function hasAnsiCodes(text) {
    return text.includes("\x1b[");
}

/**
 * Métodos de output do UIHelpers.
 * Mesclados em UIHelpers via Object.assign em ui/index.js.
 */
const _UIOutputMethods = {
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

        // Usa ANSI quando presente, textContent caso contrário (mais rápido)
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

        // Linhas novas (não histórico) são anunciadas ao leitor de tela
        if (!options.isHistory && announcer) {
            const announceLine = document.createElement("div");
            announceLine.textContent = text;
            announcer.appendChild(announceLine);
        }

        if (output.children.length > CONFIG.OUTPUT_MAX_LINES) {
            const toRemove = output.children.length - CONFIG.OUTPUT_MAX_LINES;
            for (let i = 0; i < toRemove; i++) {
                if (output.firstChild) output.removeChild(output.firstChild);
            }
        }

        this._scheduleScrollToBottom(output);
    },

    appendHistoryBlock(content, options = {}) {
        const output = getElement(CONFIG.SELECTORS.output);
        if (!output) return;

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

        if (output.children.length > CONFIG.OUTPUT_MAX_LINES) {
            const toRemove = output.children.length - CONFIG.OUTPUT_MAX_LINES;
            for (let i = 0; i < toRemove; i++) {
                if (output.firstChild) output.removeChild(output.firstChild);
            }
        }

        this._scheduleScrollToBottom(output);
    },

    addSystemMessage(message, color = null) {
        const output = getElement(CONFIG.SELECTORS.output);
        const announcer = getElement(CONFIG.SELECTORS.screenReaderAnnouncer);
        if (!output) return;

        const sysMsg = document.createElement("div");
        sysMsg.className = CONFIG.CLASSES.systemMessage;
        if (color) sysMsg.style.color = color;
        sysMsg.textContent = message;

        output.appendChild(sysMsg);

        if (announcer) {
            const announceLine = document.createElement("div");
            announceLine.textContent = message;
            announcer.appendChild(announceLine);
        }

        if (output.children.length > CONFIG.OUTPUT_MAX_LINES) {
            const toRemove = output.children.length - CONFIG.OUTPUT_MAX_LINES;
            for (let i = 0; i < toRemove; i++) {
                if (output.firstChild) output.removeChild(output.firstChild);
            }
        }

        this._scheduleScrollToBottom(output);
    }
};
