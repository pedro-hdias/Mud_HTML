/**
 * ui/status.js - Indicadores de status e controles de botões
 * Contém métodos de UIHelpers relacionados ao estado visual da conexão.
 * Mesclados em UIHelpers via Object.assign em ui/index.js.
 * Depende de: config.js (CONFIG, getElement), state/store.js (StateStore)
 */

const _UIStatusMethods = {
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
     * Atualiza o favicon SVG com a cor correspondente ao estado de conexão.
     */
    _updateFavicon(stateClass) {
        const favicon = document.getElementById("favicon");
        if (!favicon) return;
        let color = "%23666"; // cinza (desconectado)
        if (stateClass === CONFIG.CLASSES.connected) color = "%2328a745"; // verde
        else if (stateClass === CONFIG.CLASSES.connecting) color = "%23ffc107"; // amarelo
        favicon.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='${color}'/></svg>`;
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
                btnLogin.removeAttribute('hidden');
            } else {
                btnLogin.classList.remove(CONFIG.CLASSES.show);
                btnLogin.classList.add('hidden');
                btnLogin.setAttribute('hidden', '');
            }
        }
        if (typeof disconnectVisible === "boolean" && btnDisconnect) {
            if (disconnectVisible) {
                btnDisconnect.classList.add(CONFIG.CLASSES.show);
                btnDisconnect.classList.remove('hidden');
                btnDisconnect.removeAttribute('hidden');
            } else {
                btnDisconnect.classList.remove(CONFIG.CLASSES.show);
                btnDisconnect.classList.add('hidden');
                btnDisconnect.setAttribute('hidden', '');
            }
        }
        if (typeof sendDisabled === "boolean" && btnSend) btnSend.disabled = sendDisabled;
        if (typeof inputDisabled === "boolean" && input) input.disabled = inputDisabled;
    },

    setMainContentVisibility(visible) {
        const mainContent = document.getElementById("mainContent");
        const inputArea = document.getElementById("inputArea");

        if (mainContent) {
            if (visible) {
                mainContent.classList.add(CONFIG.CLASSES.show);
                mainContent.classList.remove('hidden');
                mainContent.removeAttribute('hidden');
            } else {
                mainContent.classList.remove(CONFIG.CLASSES.show);
                mainContent.classList.add('hidden');
                mainContent.setAttribute('hidden', '');
            }
        }
        if (inputArea) {
            if (visible) {
                inputArea.classList.add(CONFIG.CLASSES.show);
                inputArea.classList.remove('hidden');
                inputArea.removeAttribute('hidden');
            } else {
                inputArea.classList.remove(CONFIG.CLASSES.show);
                inputArea.classList.add('hidden');
                inputArea.setAttribute('hidden', '');
            }
        }
    },

    setMenuContainerVisibility(visible) {
        const menuContainer = document.getElementById("menuContainer");
        if (menuContainer) {
            if (visible) {
                menuContainer.classList.add(CONFIG.CLASSES.show);
                menuContainer.classList.remove('hidden');
                menuContainer.removeAttribute('hidden');
            } else {
                menuContainer.classList.remove(CONFIG.CLASSES.show);
                menuContainer.classList.add('hidden');
                menuContainer.setAttribute('hidden', '');
            }
        }
    },

    setReconnectControls({ visible, text }) {
        const reconnectStatus = getElement(CONFIG.SELECTORS.reconnectStatus);
        if (!reconnectStatus) return;

        if (visible) {
            if (text) {
                const span = reconnectStatus.querySelector("span");
                if (span) span.textContent = text;
            }
            reconnectStatus.classList.add(CONFIG.CLASSES.show);
            reconnectStatus.classList.remove('hidden');
            reconnectStatus.removeAttribute('hidden');
        } else {
            reconnectStatus.classList.remove(CONFIG.CLASSES.show);
            reconnectStatus.classList.add('hidden');
            reconnectStatus.setAttribute('hidden', '');
        }
    },

    /**
     * Mostra a latência no indicador de status (apenas quando conectado).
     */
    showLatency(ms) {
        const statusText = getElement(CONFIG.SELECTORS.statusText);
        if (!statusText) return;
        if (StateStore.getConnectionState() === "CONNECTED") {
            statusText.textContent = `Connected (${ms}ms)`;
        }
    }
};
