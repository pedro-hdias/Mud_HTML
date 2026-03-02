/**
 * audio/index.js — Ponto de entrada do pacote: monta a API pública MudAudio.
 *
 * Depende de todos os módulos do pacote (context → buffer → registry →
 * playback → controls → state) e deve ser carregado por último.
 *
 * Expõe `window.MudAudio` com a mesma API pública do arquivo original audio.js.
 */
const MudAudio = (() => {
    const p = _MudAudio;
    return {
        // Reprodução
        play:            p.play,
        playLooped:      p.playLooped,
        playDelay:       p.playDelay,
        playDelayLooped: p.playDelayLooped,

        // Controle de instâncias
        stop:            p.stop,
        isPlaying:       p.isPlaying,

        // Volume
        volume:          p.volume,
        getVolume:       p.getVolume,
        slideVol:        p.slideVol,
        fadeout:         p.fadeout,
        mute:            p.mute,
        unmute:          p.unmute,
        toggleMute:      p.toggleMute,
        isMuted:         p.isMuted,

        // Pan
        pan:             p.pan,
        slidePan:        p.slidePan,

        // Pitch / Frequência
        freq:            p.freq,
        pitch:           p.pitch,
        slidePitch:      p.slidePitch,

        // Ciclo de vida
        free:            p.free,

        // Registry
        loadRegistry:    p.loadRegistry,
        resolve:         p.resolve,
        playByName:      p.playByName,
        getRegistry:     p.getRegistry,

        // Diagnóstico
        getState:        p.getState,
        getActiveSounds: p.getActiveSounds,
    };
})();

// Expõe o MudAudio globalmente para que sound-handler.js possa acessá-lo
window.MudAudio = MudAudio;
