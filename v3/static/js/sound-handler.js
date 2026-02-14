/**
 * sound-handler.js - Gerenciador de eventos de som do backend
 * Processa eventos emitidos pelo motor de regras Prometheus e executa via MudAudio
 */

const SoundHandler = (() => {
    const soundLogger = typeof createLogger !== "undefined" ? createLogger("sound-handler") : null;

    // Mapear IDs de som para referências de áudio (para parar depois)
    const soundRefs = {};

    function log(level, msg, data) {
        if (soundLogger) {
            soundLogger[level](msg, data || "");
        } else {
            console[level]("[sound-handler] " + msg, data || "");
        }
    }

    /**
     * Processa uma lista de eventos de som vindos do backend.
     * Cada evento tem: { action, channel?, path?, delay_ms?, pan?, volume?, sound_id?, target? }
     */
    async function handleSoundEvents(events) {
        if (!events || !Array.isArray(events)) {
            log("warn", "Invalid events array");
            return;
        }

        if (!window.MudAudio) {
            log("warn", "MudAudio not available");
            return;
        }

        for (const event of events) {
            try {
                await processSoundEvent(event);
            } catch (err) {
                log("error", "Error processing sound event", err.message);
            }
        }
    }

    /**
     * Processa um evento individual de som
     */
    async function processSoundEvent(event) {
        const action = event.action || "";
        const delay_ms = event.delay_ms || 0;
        const soundId = event.sound_id;

        switch (action) {
            case "play":
                await handlePlaySound(event, delay_ms, soundId);
                break;

            case "stop":
                handleStopSound(event);
                break;

            default:
                log("debug", `Unknown sound action: ${action}`);
        }
    }

    /**
     * Manipula reprodução de som (play)
     */
    async function handlePlaySound(event, delay_ms, soundId) {
        const path = event.path;
        const channel = event.channel || "global";
        const pan = event.pan || 0;
        const volume = event.volume || 100;

        if (!path) {
            log("warn", "Play event without path");
            return;
        }

        // Concatena prefixo do servidor com o caminho do arquivo
        const fullPath = "/static/sounds/" + path;

        log("debug", `Playing sound`, {
            path,
            fullPath,
            channel,
            pan,
            volume,
            delay_ms,
            soundId
        });

        try {
            let audioId;

            if (delay_ms > 0) {
                // Reprodução com delay
                audioId = await window.MudAudio.playDelay(fullPath, delay_ms, pan, volume);
            } else {
                // Reprodução imediata
                audioId = await window.MudAudio.play(fullPath, 0, pan, volume);
            }

            // Armazena referência do som para possível parada posterior
            if (soundId) {
                soundRefs[soundId] = audioId;
                log("debug", `Sound registered`, { soundId, audioId });
            }
        } catch (err) {
            log("error", `Failed to play sound: ${path}`, err.message);
        }
    }

    /**
     * Manipula parada de som (stop)
     */
    function handleStopSound(event) {
        const target = event.target;

        if (!target) {
            log("debug", "Stopping all sounds");
            window.MudAudio.stop(0);
            return;
        }

        // Tenta encontrar o audioId associado ao target (sound_id)
        const audioId = soundRefs[target];

        if (audioId !== undefined) {
            log("debug", `Stopping sound`, { target, audioId });
            window.MudAudio.stop(audioId);
            delete soundRefs[target];
        } else {
            log("debug", `Sound reference not found`, { target });
            // Se não achar a referência, tenta parar direto (pode ser um ID de áudio bruto)
            if (target !== null && target !== undefined) {
                window.MudAudio.stop(target);
            }
        }
    }

    /**
     * Limpa todas as referências de som (útil ao desconectar)
     */
    function clearAllSounds() {
        window.MudAudio.stop(0);
        Object.keys(soundRefs).forEach(key => delete soundRefs[key]);
        log("debug", "All sounds cleared");
    }

    /**
     * Retorna o status de um som (se está tocando)
     */
    function isSoundPlaying(soundId) {
        const audioId = soundRefs[soundId];
        if (audioId === undefined) return false;
        return window.MudAudio.isPlaying(audioId);
    }

    /**
     * Retorna todas as referências ativas de som (para debug)
     */
    function getActiveSounds() {
        return { ...soundRefs };
    }

    return {
        handleSoundEvents,
        processSoundEvent,
        clearAllSounds,
        isSoundPlaying,
        getActiveSounds
    };
})();

// Expõe o SoundHandler globalmente para que ws.js possa acessá-lo
window.SoundHandler = SoundHandler;
