/**
 * audio/buffer.js — Carregamento e cache de buffers de áudio.
 *
 * Depende de: context.js (_MudAudio)
 */
(function () {
    /**
     * _loadBuffer(url) → Promise<AudioBuffer>
     * Busca e decodifica o arquivo de áudio, armazenando em cache para reuso.
     */
    async function _loadBuffer(url) {
        const { state, _ensureCtx } = _MudAudio;
        if (state.bufferCache[url]) return state.bufferCache[url];
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Falha ao carregar áudio: ${url} (${resp.status})`);
        const arrayBuf = await resp.arrayBuffer();
        const decoded = await _ensureCtx().decodeAudioData(arrayBuf);
        state.bufferCache[url] = decoded;
        return decoded;
    }

    _MudAudio._loadBuffer = _loadBuffer;
})();
