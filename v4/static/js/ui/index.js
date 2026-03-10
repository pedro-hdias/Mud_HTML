/**
 * ui/index.js - Composição do objeto UIHelpers
 * Mescla todos os grupos de métodos dos submódulos em um único objeto global UIHelpers.
 * Depende de: ui/output.js, ui/status.js, ui/helpers.js
 */

// Mescla todos os grupos de métodos em UIHelpers.
// A ordem importa: _UIHelperMethods define _scrollRafId/_trimTimeoutId e _scheduleScrollToBottom,
// que são usados por _UIOutputMethods e _UIStatusMethods.
const UIHelpers = Object.assign(
    {},
    _UIHelperMethods,   // scroll, histórico, clearOutput, setInputSecure, flashInput
    _UIStatusMethods,   // status, botões, visibilidade, favicon, latência
    _UIOutputMethods    // appendOutputLine, appendHistoryBlock, addSystemMessage
);

// Expõe UIHelpers globalmente (usado por ws.js, state.js, events.js e outros)
window.UIHelpers = UIHelpers;

// ===== UTILITÁRIO DE DEBUG =====
// Força a criação do botão de histórico para testes
window.debugForceHistoryButton = function () {
    const output = getElement(CONFIG.SELECTORS.output);
    if (!output) {
        console.error("❌ Output element not found");
        return;
    }

    console.log("🔧 Forcing history button to appear...");
    const loader = UIHelpers.ensureHistoryLoader(output);
    UIHelpers.updateHistoryLoaderState(output, true, 0);

    console.log("✅ History button created:", {
        element: loader,
        inDOM: document.contains(loader),
        display: window.getComputedStyle(loader).display,
        visibility: window.getComputedStyle(loader).visibility,
        position: loader.getBoundingClientRect()
    });

    return loader;
};
// ===== FIM DO DEBUG =====

/**
 * Exibe o modal de confirmação.
 * @param {string} message - Mensagem a exibir
 */
function showConfirmModal(message) {
    ModalManager.showConfirmModal(message);
}

/**
 * Esconde o modal de confirmação.
 */
function hideConfirmModal() {
    ModalManager.hideConfirmModal();
}
