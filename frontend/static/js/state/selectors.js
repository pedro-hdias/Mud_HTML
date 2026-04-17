/**
 * state/selectors.js - Seletores e atualizações de UI baseadas em estado
 * Contém funções que lêem o estado e atualizam a interface correspondente.
 * Depende de: state/store.js, state/mutations.js, state/persistence.js,
 *             ui/index.js (UIHelpers), config.js (CONFIG, getElement)
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
    const connectionState = StateStore.getConnectionState();
    const loginShown = StateStore.isLoginShown();
    const sessionPhase = typeof StateStore.getSessionPhase === "function"
        ? StateStore.getSessionPhase()
        : "UNAUTHENTICATED";

    stateLogger.debug("Check login display state:", connectionState, "shown:", loginShown);

    if (!StateStore.isLoginPromptAllowed()) {
        stateLogger.debug("Login display skipped: prompt not allowed");
        return;
    }

    // Evita reprocessar prompts repetidos depois que o login já foi iniciado.
    if (loginShown || sessionPhase === "AUTH_IN_PROGRESS" || sessionPhase === "IN_GAME") {
        stateLogger.debug("Login display skipped: authentication already handled");
        return;
    }

    if (connectionState !== "CONNECTED") {
        stateLogger.debug("Login display skipped: state is not CONNECTED");
        return;
    }

    const savedCredentials = StateStore.getSavedCredentials();
    if (savedCredentials) {
        stateLogger.log("Using saved credentials for login");
        sendLogin(savedCredentials.username, savedCredentials.password);
        StateStore.setLoginShown(true);
        return;
    }

    if (StateStore.isLoginModalScheduled()) {
        stateLogger.debug("Login modal already scheduled");
        return;
    }

    StateStore.setLoginModalScheduled(true);
    StateStore.setLoginShown(true);
    setTimeout(() => {
        ModalManager.showLoginModal();
    }, CONFIG.TIMEOUTS.loginModalDelay);
}
