/**
 * audio/controls.js — Controles de volume, pan e pitch/frequência.
 *
 * Depende de: context.js (_MudAudio), playback.js (_MudAudio.stop)
 */
(function () {

    // ── Volume ──────────────────────────────────────────────────────────────

    /**
     * volume(val, id?) — define volume (0-100).
     * Sem id: altera o volume master. Com id: altera o som específico.
     */
    function volume(val, id) {
        const { state, _clamp, _vol100toGain, _applyMasterVolume } = _MudAudio;
        val = _clamp(val, 0, 100);
        if (id !== undefined && state.sounds[id]) {
            state.sounds[id].gain.gain.setValueAtTime(
                _vol100toGain(val), state.ctx.currentTime
            );
            return;
        }
        state.volume = val;
        _applyMasterVolume();
    }

    /** getVolume(id?) → number — retorna volume atual (0-100) */
    function getVolume(id) {
        const { state } = _MudAudio;
        if (id !== undefined && state.sounds[id]) {
            return Math.round(state.sounds[id].gain.gain.value * 100);
        }
        return state.volume;
    }

    /** slideVol(val, id, ms) — transição suave de volume em `ms` milissegundos */
    function slideVol(val, id, ms) {
        const { state, _clamp, _vol100toGain, _ensureCtx } = _MudAudio;
        val = _clamp(val, 0, 100);
        const c = _ensureCtx();
        if (id !== undefined && state.sounds[id]) {
            const g = state.sounds[id].gain.gain;
            g.cancelScheduledValues(c.currentTime);
            g.setValueAtTime(g.value, c.currentTime);
            g.linearRampToValueAtTime(_vol100toGain(val), c.currentTime + ms / 1000);
        }
    }

    /** fadeout(id, ms?) — fade-out suave e para o som ao final */
    function fadeout(id, ms = 1000) {
        const { state, _ensureCtx } = _MudAudio;
        const c = _ensureCtx();
        const s = state.sounds[id];
        if (!s) return;
        const g = s.gain.gain;
        g.cancelScheduledValues(c.currentTime);
        g.setValueAtTime(g.value, c.currentTime);
        g.linearRampToValueAtTime(0, c.currentTime + ms / 1000);
        setTimeout(() => _MudAudio.stop(id), ms + 50);
    }

    // ── Mute ────────────────────────────────────────────────────────────────

    /** mute() — silencia o áudio master sem alterar o volume configurado */
    function mute() {
        const { state, _applyMasterVolume } = _MudAudio;
        if (state.muted) return;
        state.volumeBeforeMute = state.volume;
        state.muted = true;
        _applyMasterVolume();
    }

    /** unmute() — restaura o áudio após mute */
    function unmute() {
        const { state, _applyMasterVolume } = _MudAudio;
        if (!state.muted) return;
        state.muted = false;
        state.volume = state.volumeBeforeMute;
        _applyMasterVolume();
    }

    /** toggleMute() — alterna entre mute e unmute */
    function toggleMute() {
        _MudAudio.state.muted ? unmute() : mute();
    }

    /** isMuted() → boolean */
    function isMuted() { return _MudAudio.state.muted; }

    // ── Pan (panorama estéreo) ───────────────────────────────────────────────

    /**
     * pan(val, id?) — define pan (-100 esquerda … +100 direita).
     * Sem id: altera o pan padrão para novos sons. Com id: altera o som específico.
     */
    function pan(val, id) {
        const { state, _clamp, _pan100toWeb } = _MudAudio;
        val = _clamp(val, -100, 100);
        if (id !== undefined && state.sounds[id]) {
            state.sounds[id].panner.pan.setValueAtTime(
                _pan100toWeb(val), state.ctx.currentTime
            );
            return;
        }
        state.defaultPan = val;
    }

    /** slidePan(val, id, ms) — transição suave de pan em `ms` milissegundos */
    function slidePan(val, id, ms) {
        const { state, _clamp, _pan100toWeb, _ensureCtx } = _MudAudio;
        val = _clamp(val, -100, 100);
        const c = _ensureCtx();
        if (id !== undefined && state.sounds[id]) {
            const p = state.sounds[id].panner.pan;
            p.cancelScheduledValues(c.currentTime);
            p.setValueAtTime(p.value, c.currentTime);
            p.linearRampToValueAtTime(_pan100toWeb(val), c.currentTime + ms / 1000);
        }
    }

    // ── Pitch / Frequência ──────────────────────────────────────────────────

    /**
     * freq(val, id?) — define velocidade de reprodução (10-400, onde 100 = normal).
     * Sem id: altera o valor padrão. Com id: altera o som específico.
     */
    function freq(val, id) {
        const { state, _clamp, _freq100toRate } = _MudAudio;
        val = _clamp(val, 10, 400);
        if (id !== undefined && state.sounds[id]) {
            state.sounds[id].source.playbackRate.setValueAtTime(
                _freq100toRate(val), state.ctx.currentTime
            );
            return;
        }
        state.defaultFreq = val;
    }

    /** pitch — alias para freq */
    const pitch = freq;

    /** slidePitch(val, id, ms) — transição suave de pitch em `ms` milissegundos */
    function slidePitch(val, id, ms) {
        const { state, _clamp, _freq100toRate, _ensureCtx } = _MudAudio;
        val = _clamp(val, 10, 400);
        const c = _ensureCtx();
        if (id !== undefined && state.sounds[id]) {
            const r = state.sounds[id].source.playbackRate;
            r.cancelScheduledValues(c.currentTime);
            r.setValueAtTime(r.value, c.currentTime);
            r.linearRampToValueAtTime(_freq100toRate(val), c.currentTime + ms / 1000);
        }
    }

    Object.assign(_MudAudio, {
        volume,
        getVolume,
        slideVol,
        fadeout,
        mute,
        unmute,
        toggleMute,
        isMuted,
        pan,
        slidePan,
        freq,
        pitch,
        slidePitch,
    });
})();
