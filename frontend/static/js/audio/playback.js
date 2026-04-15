/**
 * audio/playback.js — Criação e controle de instâncias de reprodução.
 *
 * Depende de: context.js (_MudAudio), buffer.js (_MudAudio._loadBuffer)
 */
(function () {
    /**
     * _createInstance(buffer, loop, panVal, volVal) → id
     * Cria e inicia uma instância de reprodução, retornando seu ID único.
     */
    function _createInstance(buffer, loop, panVal, volVal) {
        const { state, _ensureCtx, _vol100toGain, _pan100toWeb, _freq100toRate } = _MudAudio;
        const c = _ensureCtx();
        const id = state.nextId++;

        const source = c.createBufferSource();
        source.buffer = buffer;
        source.loop = !!loop;

        const gain = c.createGain();
        gain.gain.setValueAtTime(
            _vol100toGain(volVal != null ? volVal : 100), c.currentTime
        );

        const panner = c.createStereoPanner();
        panner.pan.setValueAtTime(
            _pan100toWeb(panVal != null ? panVal : state.defaultPan), c.currentTime
        );

        source.playbackRate.setValueAtTime(
            _freq100toRate(state.defaultFreq), c.currentTime
        );

        source.connect(gain);
        gain.connect(panner);
        panner.connect(state.masterGain);

        const inst = {
            id,
            source,
            gain,
            panner,
            playing: true,
            url: null,
            _startTime: c.currentTime,
        };

        source.onended = () => {
            inst.playing = false;
            delete state.sounds[id];
        };

        state.sounds[id] = inst;
        source.start(0);
        return id;
    }

    /** play(url, loop?, pan?, vol?) → Promise<id> */
    async function play(url, loop = 0, pan = null, vol = null) {
        _MudAudio._ensureCtx();
        const buffer = await _MudAudio._loadBuffer(url);
        return _createInstance(buffer, loop, pan, vol);
    }

    /** playLooped(url) → Promise<id> */
    async function playLooped(url) {
        return play(url, 1);
    }

    /** playDelay(url, ms, pan?, vol?) → Promise<id> — inicia após `ms` milissegundos */
    async function playDelay(url, ms, pan = null, vol = null) {
        _MudAudio._ensureCtx();
        const buffer = await _MudAudio._loadBuffer(url);
        return new Promise(resolve => {
            setTimeout(() => {
                const id = _createInstance(buffer, 0, pan, vol);
                resolve(id);
            }, ms);
        });
    }

    /** playDelayLooped(url, ms, pan?, vol?) → Promise<id> — loop com delay inicial */
    async function playDelayLooped(url, ms, pan = null, vol = null) {
        _MudAudio._ensureCtx();
        const buffer = await _MudAudio._loadBuffer(url);
        return new Promise(resolve => {
            setTimeout(() => {
                const id = _createInstance(buffer, 1, pan, vol);
                resolve(id);
            }, ms);
        });
    }

    /**
     * stop(id?) — para um som pelo ID.
     * Se id === 0 ou omitido, para todos os sons ativos.
     */
    function stop(id) {
        const { state } = _MudAudio;
        if (id === 0 || id === undefined) {
            Object.values(state.sounds).forEach(s => {
                try { s.source.stop(); } catch (_) { }
                s.playing = false;
            });
            for (const k of Object.keys(state.sounds)) delete state.sounds[k];
            return;
        }
        const s = state.sounds[id];
        if (!s) return;
        try { s.source.stop(); } catch (_) { }
        s.playing = false;
        delete state.sounds[id];
    }

    /** isPlaying(id) → boolean */
    function isPlaying(id) {
        const { state } = _MudAudio;
        return !!(state.sounds[id] && state.sounds[id].playing);
    }

    Object.assign(_MudAudio, {
        _createInstance,
        play,
        playLooped,
        playDelay,
        playDelayLooped,
        stop,
        isPlaying,
    });
})();
