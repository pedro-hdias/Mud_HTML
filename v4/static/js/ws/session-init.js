/**
 * ws/session-init.js - Inicialização da sessão WebSocket
 * Gerencia o handshake inicial ao abrir a conexão.
 */

// UX: Latência — timestamp do último envio para medir round-trip
let _lastSendTimestamp = 0;

/**
 * Executado quando o WebSocket é aberto com sucesso.
 */
function handleWebSocketOpen() {
    wsLogger.log("WebSocket aberto");

    // Reseta o guard de disconnect para que a limpeza possa rodar no próximo disconnect
    _disconnectGuard = false;

    if (window.SoundInterceptor && typeof window.SoundInterceptor.init === "function") {
        window.SoundInterceptor.init();
    }

    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    // Se conectou com sucesso, permite reconexão automática em caso de queda
    if (!StateStore.isManualDisconnect()) {
        StateStore.setAllowReconnect(true);
    }

    // Obtém ou cria publicId e owner token
    const publicId = StorageManager.getOrCreatePublicId();
    const owner = StorageManager.getOwner();
    wsLogger.log("Inicializando sessão", { publicId, hasToken: !!owner });

    // Envia mensagem de inicialização (com token se existir)
    _lastSendTimestamp = Date.now();
    sendMessage("init", {
        publicId: publicId,
        owner: owner || null
    });
}
