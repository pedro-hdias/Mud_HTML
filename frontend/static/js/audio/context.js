/**
 * audio/context.js — Estado compartilhado, contexto Web Audio e utilitários.
 *
 * Cria o namespace privado `_MudAudio` que todos os módulos do pacote utilizam.
 * Deve ser o PRIMEIRO arquivo carregado do pacote.
 */
const _MudAudio = (() => {
    // ── Estado compartilhado ────────────────────────────────────────────────
    const state = {
        ctx: null,
        masterGain: null,
        volume: 100,
        muted: false,
        volumeBeforeMute: 100,
        defaultPan: 0,
        defaultFreq: 100,
        nextId: 1,
        sounds: {},
        bufferCache: {},
    };

    // ── Utilitários de conversão ────────────────────────────────────────────

    function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function _vol100toGain(v) { return _clamp(v, 0, 100) / 100; }

    function _pan100toWeb(v) { return _clamp(v, -100, 100) / 100; }

    function _freq100toRate(v) { return _clamp(v, 10, 400) / 100; }

    // ── Contexto Web Audio ──────────────────────────────────────────────────

    function _applyMasterVolume() {
        if (!state.masterGain) return;
        const target = state.muted ? 0 : _vol100toGain(state.volume);
        state.masterGain.gain.setValueAtTime(target, state.ctx.currentTime);
    }

    function _ensureCtx() {
        if (!state.ctx) {
            state.ctx = new (window.AudioContext || window.webkitAudioContext)();
            state.masterGain = state.ctx.createGain();
            state.masterGain.connect(state.ctx.destination);
            _applyMasterVolume();
        }
        if (state.ctx.state === "suspended") state.ctx.resume();
        return state.ctx;
    }

    return {
        state,
        _clamp,
        _vol100toGain,
        _pan100toWeb,
        _freq100toRate,
        _applyMasterVolume,
        _ensureCtx,
    };
})();
