/**
 * events/forms.js - Eventos do formulário de login
 * Contém: bindLoginFormEvents.
 * Mesclados em EventManager via Object.assign em events/bindings.js.
 * Depende de: config.js (CONFIG, getElement), modals.js (ModalManager),
 *             state/store.js (StateStore), events/keyboard.js (eventsLogger)
 */

const _EventFormsMethods = {
    bindLoginFormEvents() {
        const loginForm = getElement(CONFIG.SELECTORS.loginForm);
        const btnCancelLogin = getElement(CONFIG.SELECTORS.btnCancelLogin);
        const passwordInput = getElement(CONFIG.SELECTORS.passwordInput);
        const showPasswordInput = getElement(CONFIG.SELECTORS.showPasswordInput);

        if (loginForm) {
            loginForm.addEventListener("submit", (e) => {
                e.preventDefault();
                eventsLogger.log("Login form submitted");
                this.handleLoginSubmit();
            }, { signal: this._abortController.signal });
        }

        if (showPasswordInput && passwordInput) {
            showPasswordInput.addEventListener("change", () => {
                const shouldShow = showPasswordInput.checked;
                passwordInput.type = shouldShow ? "text" : "password";
                eventsLogger.log("Password visibility changed", { visible: shouldShow });
                passwordInput.focus();
            }, { signal: this._abortController.signal });
        }

        if (btnCancelLogin) {
            btnCancelLogin.addEventListener("click", () => {
                eventsLogger.log("Login cancel clicked - dismissing modal");
                ModalManager.dismissLoginModal();

                if (showPasswordInput) showPasswordInput.checked = false;
                if (passwordInput) passwordInput.type = "password";

                // Habilita o input para login manual após cancelar o formulário
                const input = getElement(CONFIG.SELECTORS.input);
                if (input && StateStore.getConnectionState() === "CONNECTED") {
                    input.disabled = false;
                    input.focus();
                }
            }, { signal: this._abortController.signal });
        }
    }
};
