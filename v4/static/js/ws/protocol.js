/**
 * ws/protocol.js - Serialização e desserialização de mensagens WebSocket
 * Primeiro módulo carregado do pacote ws — declara wsLogger para uso global.
 */

// Logger compartilhado por todos os módulos ws/
const wsLogger = createLogger("ws");

/**
 * Cria um objeto de mensagem WS padronizado.
 * @param {string} type - Tipo da mensagem
 * @param {Object} payload - Corpo da mensagem
 * @param {Object} meta - Metadados extras
 * @returns {Object}
 */
function buildMessage(type, payload = {}, meta = {}) {
    return {
        type,
        payload,
        meta: {
            ...(CONFIG.WS.messageMeta || {}),
            ...meta
        }
    };
}

/**
 * Faz parse de uma mensagem JSON crua recebida do servidor.
 * @param {string} raw - String JSON bruta
 * @returns {Object|null}
 */
function parseMessage(raw) {
    try {
        const data = JSON.parse(raw);
        const type = data.type;
        let payload = data.payload;
        const meta = data.meta || {};

        if (!payload) {
            payload = {};
            ["publicId", "owner", "value", "content", "message", "username", "password", "reason"].forEach(key => {
                if (data[key] !== undefined) {
                    payload[key] = data[key];
                }
            });
        }

        return { type, payload, meta };
    } catch (e) {
        wsLogger.error("Mensagem WS inválida", e, raw);
        return null;
    }
}
