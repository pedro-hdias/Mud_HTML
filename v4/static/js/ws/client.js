/**
 * ws/client.js - Ponto de entrada principal do pacote WebSocket
 * Coordena os módulos ws/ e expõe a API pública do cliente WebSocket.
 */

// URL do servidor WebSocket (lida da configuração)
const wsUrl = CONFIG.WS.url;

/**
 * Envia credenciais de login para o servidor.
 * @param {string} username
 * @param {string} password
 */
function sendLogin(username, password) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        wsLogger.error("Não é possível enviar login - WebSocket não conectado");
        return;
    }

    wsLogger.log("Enviando login");
    // Transiciona para AUTH_IN_PROGRESS imediatamente — desativa qualquer menu obsoleto
    transitionToPhase("AUTH_IN_PROGRESS", "login_sent");
    sendMessage("login", {
        username: username,
        password: password
    });
}
