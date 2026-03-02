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

        // Verificar cache
        if (state.bufferCache[url]) {
            console.log("[Audio] Buffer cache hit:", url);
            return state.bufferCache[url];
        }

        console.log("[Audio] Fetching sound file:", url);

        try {
            const resp = await fetch(url);

            if (!resp.ok) {
                const error = new Error(`[Audio] Failed to load: ${url} (HTTP ${resp.status})`);
                console.error(error.message);
                throw error;
            }

            const arrayBuf = await resp.arrayBuffer();
            console.log(`[Audio] Decoding audio (${(arrayBuf.byteLength / 1024).toFixed(1)}KB):`, url);

            const decoded = await _ensureCtx().decodeAudioData(arrayBuf);
            state.bufferCache[url] = decoded;

            console.log(`[Audio] Successfully loaded: ${url}`);
            return decoded;
        } catch (err) {
            console.error(`[Audio] Error loading ${url}:`, err);
            throw err;
        }
    }

    _MudAudio._loadBuffer = _loadBuffer;
})();
