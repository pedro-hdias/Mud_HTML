const MudAudio = (() => {
    let ctx = null;
    let masterGain = null;
    let _volume = 100;
    let _muted = false;
    let _volumeBeforeMute = 100;
    let _defaultPan = 0;
    let _defaultFreq = 100;
    let _nextId = 1;
    const sounds = {};
    const bufferCache = {};

    // ── Sound Registry ──────────────────────────────────────
    const SOUNDS_BASE = "/static/sounds/";
    let _registry = null;   // nome → arquivo
    let _registryReady = null; // Promise

    /**
     * loadRegistry(jsonUrl?) — carrega sounds.json.
     * Chamado automaticamente na primeira playByName, ou manualmente.
     */
    async function loadRegistry(jsonUrl) {
        const url = jsonUrl || SOUNDS_BASE + "sounds.json";
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Registry não encontrado: ${url} (${resp.status})`);
        const data = await resp.json();
        _registry = {};
        for (const [k, v] of Object.entries(data)) {
            if (!k.startsWith("_")) _registry[k] = v;  // ignora _comment, _usage
        }
        return _registry;
    }

    /** _ensureRegistry — garante que o registry está carregado */
    function _ensureRegistry() {
        if (!_registryReady) _registryReady = loadRegistry();
        return _registryReady;
    }

    /**
     * resolve(name) — converte nome semântico em URL.
     * Se name já é URL (começa com / ou http), retorna direto.
     */
    async function resolve(name) {
        if (name.startsWith("/") || name.startsWith("http")) return name;
        await _ensureRegistry();
        const file = _registry[name];
        if (!file) throw new Error(`Som não encontrado no registry: "${name}"`);
        return SOUNDS_BASE + file;
    }

    /**
     * playByName(name, loop?, pan?, vol?) → Promise<id>
     * Aceita nome semântico do registry OU url direta.
     */
    async function playByName(name, loop = 0, pan = null, vol = null) {
        const url = await resolve(name);
        return play(url, loop, pan, vol);
    }

    /** getRegistry() — retorna cópia do registry carregado */
    async function getRegistry() {
        await _ensureRegistry();
        return { ..._registry };
    }

    function _ensureCtx() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = ctx.createGain();
            masterGain.connect(ctx.destination);
            _applyMasterVolume();
        }
        if (ctx.state === "suspended") ctx.resume();
        return ctx;
    }

    function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function _vol100toGain(v) { return _clamp(v, 0, 100) / 100; }

    function _pan100toWeb(v) { return _clamp(v, -100, 100) / 100; }

    function _freq100toRate(v) { return _clamp(v, 10, 400) / 100; }

    function _applyMasterVolume() {
        if (!masterGain) return;
        const target = _muted ? 0 : _vol100toGain(_volume);
        masterGain.gain.setValueAtTime(target, ctx.currentTime);
    }

    async function _loadBuffer(url) {
        if (bufferCache[url]) return bufferCache[url];
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Falha ao carregar áudio: ${url} (${resp.status})`);
        const arrayBuf = await resp.arrayBuffer();
        const decoded = await _ensureCtx().decodeAudioData(arrayBuf);
        bufferCache[url] = decoded;
        return decoded;
    }

    function _createInstance(buffer, loop, panVal, volVal) {
        const c = _ensureCtx();
        const id = _nextId++;

        const source = c.createBufferSource();
        source.buffer = buffer;
        source.loop = !!loop;

        const gain = c.createGain();
        gain.gain.setValueAtTime(
            _vol100toGain(volVal != null ? volVal : 100), c.currentTime
        );

        const panner = c.createStereoPanner();
        panner.pan.setValueAtTime(
            _pan100toWeb(panVal != null ? panVal : _defaultPan), c.currentTime
        );

        source.playbackRate.setValueAtTime(
            _freq100toRate(_defaultFreq), c.currentTime
        );

        source.connect(gain);
        gain.connect(panner);
        panner.connect(masterGain);

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
            delete sounds[id];
        };

        sounds[id] = inst;
        source.start(0);
        return id;
    }

    async function play(url, loop = 0, pan = null, vol = null) {
        _ensureCtx();
        const buffer = await _loadBuffer(url);
        return _createInstance(buffer, loop, pan, vol);
    }

    async function playLooped(url) {
        return play(url, 1);
    }

    async function playDelay(url, ms, pan = null, vol = null) {
        _ensureCtx();
        const buffer = await _loadBuffer(url);
        return new Promise(resolve => {
            setTimeout(() => {
                const id = _createInstance(buffer, 0, pan, vol);
                resolve(id);
            }, ms);
        });
    }

    async function playDelayLooped(url, ms, pan = null, vol = null) {
        _ensureCtx();
        const buffer = await _loadBuffer(url);
        return new Promise(resolve => {
            setTimeout(() => {
                const id = _createInstance(buffer, 1, pan, vol);
                resolve(id);
            }, ms);
        });
    }

    function stop(id) {
        if (id === 0 || id === undefined) {
            Object.values(sounds).forEach(s => {
                try { s.source.stop(); } catch (_) { }
                s.playing = false;
            });
            for (const k of Object.keys(sounds)) delete sounds[k];
            return;
        }
        const s = sounds[id];
        if (!s) return;
        try { s.source.stop(); } catch (_) { }
        s.playing = false;
        delete sounds[id];
    }

    function isPlaying(id) {
        return !!(sounds[id] && sounds[id].playing);
    }

    function volume(val, id) {
        val = _clamp(val, 0, 100);
        if (id !== undefined && sounds[id]) {
            sounds[id].gain.gain.setValueAtTime(
                _vol100toGain(val), ctx.currentTime
            );
            return;
        }
        _volume = val;
        _applyMasterVolume();
    }

    function getVolume(id) {
        if (id !== undefined && sounds[id]) {
            return Math.round(sounds[id].gain.gain.value * 100);
        }
        return _volume;
    }

    function slideVol(val, id, ms) {
        val = _clamp(val, 0, 100);
        const c = _ensureCtx();
        if (id !== undefined && sounds[id]) {
            const g = sounds[id].gain.gain;
            g.cancelScheduledValues(c.currentTime);
            g.setValueAtTime(g.value, c.currentTime);
            g.linearRampToValueAtTime(_vol100toGain(val), c.currentTime + ms / 1000);
        }
    }

    function fadeout(id, ms = 1000) {
        const c = _ensureCtx();
        const s = sounds[id];
        if (!s) return;
        const g = s.gain.gain;
        g.cancelScheduledValues(c.currentTime);
        g.setValueAtTime(g.value, c.currentTime);
        g.linearRampToValueAtTime(0, c.currentTime + ms / 1000);
        setTimeout(() => stop(id), ms + 50);
    }

    function mute() {
        if (_muted) return;
        _volumeBeforeMute = _volume;
        _muted = true;
        _applyMasterVolume();
    }

    function unmute() {
        if (!_muted) return;
        _muted = false;
        _volume = _volumeBeforeMute;
        _applyMasterVolume();
    }

    function toggleMute() {
        _muted ? unmute() : mute();
    }

    function isMuted() { return _muted; }

    function pan(val, id) {
        val = _clamp(val, -100, 100);
        if (id !== undefined && sounds[id]) {
            sounds[id].panner.pan.setValueAtTime(
                _pan100toWeb(val), ctx.currentTime
            );
            return;
        }
        _defaultPan = val;
    }

    function slidePan(val, id, ms) {
        val = _clamp(val, -100, 100);
        const c = _ensureCtx();
        if (id !== undefined && sounds[id]) {
            const p = sounds[id].panner.pan;
            p.cancelScheduledValues(c.currentTime);
            p.setValueAtTime(p.value, c.currentTime);
            p.linearRampToValueAtTime(_pan100toWeb(val), c.currentTime + ms / 1000);
        }
    }

    function freq(val, id) {
        val = _clamp(val, 10, 400);
        if (id !== undefined && sounds[id]) {
            sounds[id].source.playbackRate.setValueAtTime(
                _freq100toRate(val), ctx.currentTime
            );
            return;
        }
        _defaultFreq = val;
    }

    const pitch = freq;

    function slidePitch(val, id, ms) {
        val = _clamp(val, 10, 400);
        const c = _ensureCtx();
        if (id !== undefined && sounds[id]) {
            const r = sounds[id].source.playbackRate;
            r.cancelScheduledValues(c.currentTime);
            r.setValueAtTime(r.value, c.currentTime);
            r.linearRampToValueAtTime(_freq100toRate(val), c.currentTime + ms / 1000);
        }
    }

    function free() {
        stop(0);
        if (ctx) {
            ctx.close().catch(() => { });
            ctx = null;
            masterGain = null;
        }
        for (const k of Object.keys(bufferCache)) delete bufferCache[k];
        _nextId = 1;
        // registry permanece carregado (não precisa recarregar)
    }

    function getState() {
        return {
            volume: _volume,
            muted: _muted,
            defaultPan: _defaultPan,
            defaultFreq: _defaultFreq,
            activeSounds: Object.keys(sounds).length,
            cachedBuffers: Object.keys(bufferCache).length,
            registryLoaded: !!_registry,
            registrySize: _registry ? Object.keys(_registry).length : 0,
            contextState: ctx ? ctx.state : "closed",
        };
    }

    function getActiveSounds() {
        return Object.entries(sounds).map(([id, s]) => ({
            id: Number(id),
            playing: s.playing,
            loop: s.source.loop,
            volume: Math.round(s.gain.gain.value * 100),
            pan: Math.round(s.panner.pan.value * 100),
            rate: Math.round(s.source.playbackRate.value * 100),
        }));
    }

    return {
        play,
        playLooped,
        playDelay,
        playDelayLooped,
        stop,
        isPlaying,
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
        free,

        // registry
        loadRegistry,
        resolve,
        playByName,
        getRegistry,

        getState,
        getActiveSounds,
    };
})();

// Expõe o MudAudio globalmente para que sound-handler.js possa acessá-lo
window.MudAudio = MudAudio;
