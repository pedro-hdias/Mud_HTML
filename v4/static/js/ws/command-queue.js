/**
 * ws/command-queue.js - Gerenciamento da fila de comandos
 * Controla o envio e enfileiramento de comandos para o servidor MUD.
 */

// Fila de comandos pendentes (enviados durante reconexão)
let pendingCommandQueue = [];

// Fila de saída (sem delay, envia direto)
let _outgoingQueue = [];

// Último comando enviado (para navegação de histórico)
let lastCommandSent = "";

/**
 * Divide comandos separados por ponto-e-vírgula.
 * @param {string} commandText
 * @returns {string[]}
 */
function splitCommands(commandText) {
    return commandText
        .split(";")
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0);
}

/**
 * Envia comando para o servidor sem delay.
 * Comandos simples e macros são enviados imediatamente.
 * Usa late binding para sendMessage (definido em transport.js, carregado depois).
 * @param {string} commandText
 */
function sendCommand(commandText) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        // Se estamos reconectando, enfileira o comando
        if (StateStore.isReconnecting() && pendingCommandQueue.length < CONFIG.COMMAND_QUEUE_MAX) {
            pendingCommandQueue.push(commandText);
            wsLogger.log("Comando enfileirado durante reconexão", commandText, `(${pendingCommandQueue.length} na fila)`);
            UIHelpers.addSystemMessage(`[SYSTEM] Command queued (reconnecting...) [${pendingCommandQueue.length}/${CONFIG.COMMAND_QUEUE_MAX}]`, "#888");
            return;
        }
        wsLogger.error("Não é possível enviar comando - WebSocket não conectado");
        UIHelpers.addSystemMessage("[SYSTEM] Not connected - reconnecting...", "orange");
        return;
    }

    const commands = splitCommands(commandText);
    if (commands.length === 0) return;

    if (commands.length === 1) {
        // Comando único: envia diretamente (baixa latência)
        lastCommandSent = commands[0];
        wsLogger.log("Enviando comando", commands[0]);
        sendMessage("command", { value: commands[0] });
        return;
    }

    // Múltiplos comandos (macro): envia cada um diretamente sem delay
    wsLogger.log(`Enviando macro: count=${commands.length}`);
    commands.forEach(cmd => {
        lastCommandSent = cmd;
        sendMessage("command", { value: cmd });
        wsLogger.debug("Comando de macro enviado", cmd);
    });
}

/**
 * Envia os comandos pendentes da fila após reconexão.
 */
function flushPendingCommands() {
    if (pendingCommandQueue.length === 0) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    wsLogger.log(`Liberando ${pendingCommandQueue.length} comandos pendentes`);
    const queued = [...pendingCommandQueue];
    pendingCommandQueue = [];

    for (const cmd of queued) {
        sendCommand(cmd);
    }

    if (queued.length > 0) {
        UIHelpers.addSystemMessage(`[SYSTEM] ${queued.length} queued command(s) sent.`, "#4CAF50");
    }
}

/**
 * Retorna o último comando enviado.
 * @returns {string}
 */
function getLastCommandSent() {
    return lastCommandSent;
}

/**
 * Processa os comandos da fila de saída imediata.
 */
function _processQueuedCommands() {
    while (_outgoingQueue.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
        const cmd = _outgoingQueue.shift();
        lastCommandSent = cmd;
        sendMessage("command", { value: cmd });
        wsLogger.debug("Comando da fila enviado", cmd, `(${_outgoingQueue.length} restantes)`);
    }
}

/**
 * Limpa a fila de saída imediata.
 */
function _stopOutgoingQueue() {
    _outgoingQueue = [];
}
