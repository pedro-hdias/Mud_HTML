/**
 * menu/parser.js - Validação de payloads de menu
 * Contém funções de validação para dados de menu recebidos do backend.
 */

// Logger compartilhado por todos os módulos do pacote menu/
const menuLogger = createLogger("menu");

/**
 * Valida se o payload de menu recebido do backend é utilizável.
 * @param {object} payload - Payload do menu recebido
 * @param {number} minOptions - Mínimo de opções para considerar válido
 * @returns {boolean}
 */
function validateMenuPayload(payload, minOptions) {
    return payload &&
        Array.isArray(payload.options) &&
        payload.options.length >= minOptions;
}
