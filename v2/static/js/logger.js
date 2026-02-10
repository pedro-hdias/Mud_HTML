/**
 * logger.js - Logger com níveis configuráveis
 * Níveis: debug < info < warn < error
 * Configurar via: LOG_LEVEL = "warn" (no console ou antes de carregar)
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, none: 4 };

// Nível global — pode ser alterado em runtime: LOG_LEVEL = "debug"
// Lê da <meta name="mud-log-level"> se presente, senão usa "info"
var LOG_LEVEL = (typeof LOG_LEVEL !== "undefined") ? LOG_LEVEL
    : (function () {
        var el = document.querySelector('meta[name="mud-log-level"]');
        return el ? el.getAttribute("content") : "info";
    })();

function createLogger(moduleName) {
    function prefix() {
        return "[" + new Date().toISOString() + "] [" + moduleName + "]";
    }

    function shouldLog(level) {
        return (LOG_LEVELS[level] || 0) >= (LOG_LEVELS[LOG_LEVEL] || 0);
    }

    return {
        debug: function () {
            if (shouldLog("debug")) console.debug(prefix(), ...arguments);
        },
        log: function () {
            if (shouldLog("info")) console.log(prefix(), ...arguments);
        },
        info: function () {
            if (shouldLog("info")) console.info(prefix(), ...arguments);
        },
        warn: function () {
            if (shouldLog("warn")) console.warn(prefix(), ...arguments);
        },
        error: function () {
            if (shouldLog("error")) console.error(prefix(), ...arguments);
        }
    };
}
