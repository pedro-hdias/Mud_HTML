/**
 * state/persistence.js - Persistência do estado de sessão
 * Contém o objeto StateManager com métodos de leitura/escrita do armazenamento.
 * Depende de: state/store.js (StateStore, stateLogger), storage.js (StorageManager)
 */

const StateManager = {
    loadSessionState() {
        try {
            StateStore.setSavedCredentials(StorageManager.getCredentials());
            const wasLoggedIn = StorageManager.isLoggedIn();
            const allowLogin = StorageManager.isAllowLoginPrompt();

            StateStore.setAllowLoginPrompt(allowLogin);
            StateStore.setLoginShown(wasLoggedIn);

            stateLogger.log("Loaded session state", { wasLoggedIn, allowLogin });
        } catch (e) {
            stateLogger.error("Error loading session state", e);
        }
    },

    saveLoginState() {
        try {
            StorageManager.setLoggedIn(StateStore.isLoginShown());
            StorageManager.setAllowLoginPrompt(StateStore.isLoginPromptAllowed());
            stateLogger.log("Saved login state");
        } catch (e) {
            stateLogger.error("Error saving login state", e);
        }
    },

    saveConnectionState() {
        // Não salva mais o estado de conexão para evitar reconexão automática.
        // A conexão agora é sempre manual através do botão Login.
    },

    clearSessionState() {
        try {
            StorageManager.clearAll();
            StateStore.resetSessionFlags();
            stateLogger.log("Cleared session state");
        } catch (e) {
            stateLogger.error("Error clearing session state", e);
        }
    }
};

// Inicialização: carrega estado salvo quando a página carrega
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        StateManager.loadSessionState();
        stateLogger.log("Session state loaded on DOMContentLoaded");
    });
} else {
    StateManager.loadSessionState();
    stateLogger.log("Session state loaded immediately");
}
