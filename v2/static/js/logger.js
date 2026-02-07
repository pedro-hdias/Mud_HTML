function createLogger(moduleName) {
    function prefix() {
        return "[" + new Date().toISOString() + "] [" + moduleName + "]";
    }

    return {
        log: function () {
            console.log(prefix(), ...arguments);
        },
        warn: function () {
            console.warn(prefix(), ...arguments);
        },
        error: function () {
            console.error(prefix(), ...arguments);
        }
    };
}
