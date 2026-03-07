/**
 * state/selectors.js - Seletores e atualizações de UI baseadas em estado
 * Contém funções que lêem o estado e atualizam a interface correspondente.
 * Depende de: state/store.js, state/mutations.js, state/persistence.js,
 *             ui.js/ui/index.js (UIHelpers), config.js (CONFIG, getElement)
 */

/**
 * Atualiza a interface baseada no estado de conexão recebido.
 * @param {string} state - Novo estado: "DISCONNECTED" | "CONNECTING" | "RECONNECTING" | "CONNECTED" | "AWAITING_LOGIN"
 */
function updateConnectionState(state) {
    const previousState = StateStore.setConnectionState(state);
    stateLogger.log("State change", previousState, "->", state);

    switch (state) {
        case "DISCONNECTED":
            UIHelpers.setStatusIndicator({ text: "Disconnected" });
            UIHelpers.setReconnectControls({ visible: false });
            UIHelpers.setButtonsState({
                loginVisible: true,
                disconnectVisible: false,
                sendDisabled: true,
                inputDisabled: true
            });
            UIHelpers.setMainContentVisibility(false);

            // Limpa output apenas em transições reais de desconexão (não relatórios de estado)
            if (previousState !== "DISCONNECTED") {
                UIHelpers.clearOutput();
            }

            transitionToPhase("UNAUTHENTICATED", "disconnected");
            if (!StateStore.isReconnecting() && StateStore.isSessionInitialized()) {
                StateManager.clearSessionState();
            }
            break;

        case "CONNECTING":
            UIHelpers.setStatusIndicator({
                text: "Connecting...",
                stateClass: CONFIG.CLASSES.connecting
            });
            UIHelpers.setReconnectControls({ visible: true, text: "Connecting..." });
            UIHelpers.setButtonsState({
                loginVisible: false,
                disconnectVisible: false,
                sendDisabled: true,
                inputDisabled: true
            });
            UIHelpers.setMainContentVisibility(true);
            // Limpa output anterior ao iniciar nova conexão a partir de DISCONNECTED
            if (previousState === "DISCONNECTED") {
                UIHelpers.clearOutput();
            }
            break;

        case "RECONNECTING":
            UIHelpers.setStatusIndicator({
                text: "Reconnecting...",
                stateClass: CONFIG.CLASSES.connecting
            });
            UIHelpers.setReconnectControls({ visible: true, text: "Reconnecting..." });
            UIHelpers.setButtonsState({
                loginVisible: false,
                disconnectVisible: false,
                sendDisabled: true,
                inputDisabled: true
            });
            UIHelpers.setMainContentVisibility(true);
            break;

        case "CONNECTED":
            UIHelpers.setStatusIndicator({
                text: "Connected",
                stateClass: CONFIG.CLASSES.connected
            });
            UIHelpers.setReconnectControls({ visible: false });
            UIHelpers.setButtonsState({
                loginVisible: false,
                disconnectVisible: true,
                sendDisabled: false,
                inputDisabled: false
            });
            UIHelpers.setMainContentVisibility(true);
            const input = getElement(CONFIG.SELECTORS.input);
            if (input) input.focus();

            // Se estamos reconectando, tenta fazer login automaticamente
            const savedCredentials = StateStore.getSavedCredentials();
            if (StateStore.isReconnecting() && savedCredentials && !StateStore.isLoginShown()) {
                stateLogger.log("Reconnecting - attempting auto-login");
                setTimeout(() => {
                    sendLogin(savedCredentials.username, savedCredentials.password);
                    StateStore.setLoginShown(true);
                    StateManager.saveLoginState();
                    // Envia comandos enfileirados durante a reconexão
                    setTimeout(() => {
                        if (typeof flushPendingCommands === "function") flushPendingCommands();
                    }, CONFIG.TIMEOUTS.reconnectDelay);
                }, CONFIG.TIMEOUTS.reconnectDelay);
                StateStore.setIsReconnecting(false);
            } else if (StateStore.isReconnecting() && !savedCredentials) {
                StateStore.setIsReconnecting(false);
                // Sem credenciais, flush imediato (pode ser sessão sem login)
                if (typeof flushPendingCommands === "function") flushPendingCommands();
            }
            break;

        case "AWAITING_LOGIN":
            UIHelpers.setStatusIndicator({
                text: "Awaiting login",
                stateClass: CONFIG.CLASSES.connected
            });
            UIHelpers.setReconnectControls({ visible: false });
            UIHelpers.setButtonsState({
                loginVisible: false,
                disconnectVisible: true,
                sendDisabled: true,
                inputDisabled: true
            });
            UIHelpers.setMainContentVisibility(true);
            break;
    }
}

/**
 * Verifica e exibe o modal de login quando apropriado.
 */
function checkAndShowLogin() {
    stateLogger.log("Check login display", "state:", StateStore.getConnectionState(), "shown:", StateStore.isLoginShown());

    if (!StateStore.isLoginPromptAllowed()) {
        stateLogger.warn("Login display blocked: prompt not allowed");
        return;
    }

    if (!StateStore.isLoginShown() && StateStore.getConnectionState() === "CONNECTED") {
        const savedCredentials = StateStore.getSavedCredentials();
        if (savedCredentials) {
            stateLogger.log("Using saved credentials for login");
            sendLogin(savedCredentials.username, savedCredentials.password);
            StateStore.setLoginShown(true);
        } else {
            if (StateStore.isLoginModalScheduled()) {
                stateLogger.warn("Login modal already scheduled");
                return;
            }
            StateStore.setLoginModalScheduled(true);
            StateStore.setLoginShown(true);
            setTimeout(() => {
                ModalManager.showLoginModal();
            }, CONFIG.TIMEOUTS.loginModalDelay);
        }
    } else if (StateStore.isLoginShown()) {
        stateLogger.warn("Login display blocked: already shown");
    } else {
        stateLogger.warn("Login display blocked: state is not CONNECTED");
    }
}
