/**
 * state/mutations.js - Mutações de estado de sessão
 * Contém funções auxiliares para transição de fases do jogo.
 * Depende de: state/store.js (StateStore, stateLogger)
 */

/**
 * Realiza transição idempotente para uma nova fase de sessão.
 * Desativa menus ao entrar em AUTH_IN_PROGRESS ou IN_GAME.
 * @param {string} nextPhase - "UNAUTHENTICATED" | "AUTH_IN_PROGRESS" | "IN_GAME"
 * @param {string} reason - Motivo da transição (para logging)
 */
function transitionToPhase(nextPhase, reason) {
    const current = StateStore.getSessionPhase();
    if (current === nextPhase) {
        stateLogger.debug("Phase already", nextPhase, "(" + reason + ")");
        return;
    }
    stateLogger.log("Session phase:", current, "->", nextPhase, "(" + reason + ")");
    StateStore.setSessionPhase(nextPhase);

    if (nextPhase === "AUTH_IN_PROGRESS" || nextPhase === "IN_GAME") {
        if (typeof MenuManager !== "undefined") MenuManager.reset();
    }
}
