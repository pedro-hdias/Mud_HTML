/**
 * ws/reconnect.js - Política de reconexão WebSocket
 * Gerencia tentativas de reconexão com backoff exponencial e jitter.
 */

let reconnectAttempts = 0;
let reconnectTimeout = null;
const MAX_RECONNECT_ATTEMPTS = CONFIG.WS.reconnectMaxAttempts;
const RECONNECT_BASE_DELAY_MS = CONFIG.WS.reconnectBaseDelayMs;
const RECONNECT_MAX_DELAY_MS = CONFIG.WS.reconnectMaxDelayMs;

/**
 * Agenda uma tentativa de reconexão com backoff exponencial.
 * Usa late binding para connectWebSocket (definido em transport.js).
 */
function scheduleReconnect() {
    if (StateStore.isManualDisconnect()) {
        wsLogger.log("Desconexão manual - não reconectando");
        StateStore.setAllowReconnect(false);
        StateStore.setIsReconnecting(false);
        return;
    }

    if (!StateStore.isReconnectAllowed()) {
        wsLogger.log("Reconexão automática não permitida - aguardando ação do usuário");
        StateStore.setIsReconnecting(false);
        return;
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        wsLogger.error("Número máximo de tentativas de reconexão atingido");
        StateStore.setAllowReconnect(false);
        StateStore.setIsReconnecting(false);
        updateConnectionState("DISCONNECTED");
        UIHelpers.addSystemMessage("[SYSTEM] Failed to reconnect after multiple attempts. Click 'Login' to try again.", "red");
        return;
    }

    StateStore.setIsReconnecting(true);
    updateConnectionState("RECONNECTING");

    reconnectAttempts++;
    // Backoff exponencial com jitter: base * 2^(tentativa-1) + jitter aleatório
    const expDelay = Math.min(
        RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts - 1),
        RECONNECT_MAX_DELAY_MS
    );
    const jitter = Math.floor(Math.random() * 1000);
    const delay = expDelay + jitter;
    wsLogger.log(`Agendando reconexão tentativa ${reconnectAttempts} em ${delay}ms (base: ${expDelay}, jitter: ${jitter})`);

    reconnectTimeout = setTimeout(() => {
        wsLogger.log(`Tentativa de reconexão ${reconnectAttempts}`);
        StateStore.setIsReconnecting(true);
        connectWebSocket();
    }, delay);
}

/**
 * Cancela a tentativa de reconexão em andamento.
 */
function cancelReconnectAttempt() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    StateStore.setAllowReconnect(false);
    StateStore.setIsReconnecting(false);
    updateConnectionState("DISCONNECTED");

    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        ws.close();
    }

    UIHelpers.addSystemMessage("[SYSTEM] Connection cancelled.", "orange");
}
