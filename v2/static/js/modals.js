/**
 * modals.js - Gerenciamento de modais
 * Controla modais de login e confirmação
 */

const modalsLogger = createLogger("modals");

const ModalManager = {
    confirmShown: false,
    loginModalDismissed: false, // Flag para rastrear se o usuário cancelou o popup

    // Modal de Login
    showLoginModal() {
        try {
            // Se o usuário já cancelou o popup, não mostra novamente
            if (this.loginModalDismissed) {
                modalsLogger.log("Login modal dismissed by user - not showing again");
                return;
            }

            const loginModal = getElement(CONFIG.SELECTORS.loginModal);
            const usernameInput = getElement(CONFIG.SELECTORS.usernameInput);

            if (!loginModal) {
                modalsLogger.error("Login modal element not found");
                return;
            }

            modalsLogger.log("Showing login modal");
            loginModal.classList.add(CONFIG.CLASSES.show);
            if (usernameInput) usernameInput.focus();
        } catch (e) {
            modalsLogger.error("Error showing login modal", e);
        }
    },

    hideLoginModal() {
        try {
            const loginModal = getElement(CONFIG.SELECTORS.loginModal);
            if (!loginModal) return;

            modalsLogger.log("Hiding login modal");
            loginModal.classList.remove(CONFIG.CLASSES.show);
        } catch (e) {
            modalsLogger.error("Error hiding login modal", e);
        }
    },

    dismissLoginModal() {
        try {
            this.loginModalDismissed = true;
            this.hideLoginModal();
            modalsLogger.log("Login modal dismissed - will not show automatically again");
        } catch (e) {
            modalsLogger.error("Error dismissing login modal", e);
        }
    },

    resetLoginModalDismissal() {
        this.loginModalDismissed = false;
        modalsLogger.log("Login modal dismissal reset");
    },
    showConfirmModal(message) {
        try {
            if (this.confirmShown) {
                modalsLogger.warn("Confirm modal already shown");
                return;
            }

            const confirmModal = getElement(CONFIG.SELECTORS.confirmModal);
            const confirmText = getElement(CONFIG.SELECTORS.confirmText);
            const input = getElement(CONFIG.SELECTORS.input);
            const btnSend = getElement(CONFIG.SELECTORS.btnSend);
            const btnConfirmYes = getElement(CONFIG.SELECTORS.btnConfirmYes);

            if (!confirmModal || !confirmText) {
                modalsLogger.error("Confirm modal elements not found");
                return;
            }

            modalsLogger.log("Showing confirm modal");
            confirmText.textContent = message;
            confirmModal.classList.add(CONFIG.CLASSES.show);
            this.confirmShown = true;

            if (input) input.disabled = true;
            if (btnSend) btnSend.disabled = true;
            if (btnConfirmYes) btnConfirmYes.focus();
        } catch (e) {
            modalsLogger.error("Error showing confirm modal", e);
        }
    },

    hideConfirmModal() {
        try {
            if (!this.confirmShown) return;

            const confirmModal = getElement(CONFIG.SELECTORS.confirmModal);
            if (!confirmModal) return;

            modalsLogger.log("Hiding confirm modal");
            confirmModal.classList.remove(CONFIG.CLASSES.show);
            this.confirmShown = false;

            // Restaura estado da UI
            updateConnectionState(StateStore.getConnectionState());
        } catch (e) {
            modalsLogger.error("Error hiding confirm modal", e);
        }
    }
};
