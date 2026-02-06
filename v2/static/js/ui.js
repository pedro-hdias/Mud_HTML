/**
 * ui.js (refatorado) - Interface do usuário
 * Contém função auxiliar para mostrar modal de confirmação e renderização básica
 * Event listeners movidos para events.js
 */

const uiLogger = createLogger("ui");

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
