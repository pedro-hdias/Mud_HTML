/**
 * audio/state.js — Inspeção de estado e liberação de recursos.
 *
 * Depende de: context.js (_MudAudio), playback.js (_MudAudio.stop)
 */
(function () {
    /**
     * free() — para todos os sons, fecha o AudioContext e limpa o cache de buffers.
     * O registry não é removido (não precisa recarregar).
     */
    function free() {
        const { state } = _MudAudio;
        _MudAudio.stop(0);
        if (state.ctx) {
            state.ctx.close().catch(() => { });
            state.ctx = null;
            state.masterGain = null;
        }
        for (const k of Object.keys(state.bufferCache)) delete state.bufferCache[k];
        state.nextId = 1;
    }

    /**
     * getState() → object — retorna um snapshot do estado interno para diagnóstico.
     */
    function getState() {
        const { state } = _MudAudio;
        return {
            volume: state.volume,
            muted: state.muted,
            defaultPan: state.defaultPan,
            defaultFreq: state.defaultFreq,
            activeSounds: Object.keys(state.sounds).length,
            cachedBuffers: Object.keys(state.bufferCache).length,
            registryLoaded: !!_MudAudio._registry,
            registrySize: _MudAudio._registry ? Object.keys(_MudAudio._registry).length : 0,
            contextState: state.ctx ? state.ctx.state : "closed",
        };
    }

    /**
     * getActiveSounds() → Array — retorna lista de sons em reprodução para diagnóstico.
     */
    function getActiveSounds() {
        const { state } = _MudAudio;
        return Object.entries(state.sounds).map(([id, s]) => ({
            id: Number(id),
            playing: s.playing,
            loop: s.source.loop,
            volume: Math.round(s.gain.gain.value * 100),
            pan: Math.round(s.panner.pan.value * 100),
            rate: Math.round(s.source.playbackRate.value * 100),
        }));
    }

    Object.assign(_MudAudio, { free, getState, getActiveSounds });
})();
