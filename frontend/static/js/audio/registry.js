/**
 * audio/registry.js — Registro semântico de sons (sounds.json).
 *
 * Permite referenciar sons por nome em vez de URL direta.
 * Depende de: context.js (_MudAudio)
 */
(function () {
    const SOUNDS_BASE = typeof buildMudPath === "function" ? `${buildMudPath("/sounds")}/` : "/sounds/";

    // _registry e _registryReady ficam no namespace para permitir inspeção
    _MudAudio._registry = null;
    let _registryReady = null;

    /**
     * loadRegistry(jsonUrl?) — carrega sounds.json.
     * Chamado automaticamente na primeira playByName, ou manualmente.
     */
    async function loadRegistry(jsonUrl) {
        const url = jsonUrl || SOUNDS_BASE + "sounds.json";
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Registry não encontrado: ${url} (${resp.status})`);
        const data = await resp.json();
        _MudAudio._registry = {};
        for (const [k, v] of Object.entries(data)) {
            if (!k.startsWith("_")) _MudAudio._registry[k] = v; // ignora _comment, _usage
        }
        return _MudAudio._registry;
    }

    /** _ensureRegistry — garante que o registry está carregado */
    function _ensureRegistry() {
        if (!_registryReady) _registryReady = loadRegistry();
        return _registryReady;
    }

    /**
     * resolve(name) — converte nome semântico em URL.
     * Se name já é URL (começa com / ou http), retorna direto.
     * Busca case-insensitive: 'Flight Control' e 'flight control' são tratados igualmente.
     */
    async function resolve(name) {
        if (name.startsWith("/") || name.startsWith("http")) return name;
        await _ensureRegistry();

        // Primeiro tenta encontrar exatamente (mais rápido)
        let file = _MudAudio._registry[name];
        if (file) return SOUNDS_BASE + file;

        // Se não encontrou, busca case-insensitive
        const nameLower = name.toLowerCase();
        for (const [key, value] of Object.entries(_MudAudio._registry)) {
            if (key.toLowerCase() === nameLower) {
                return SOUNDS_BASE + value;
            }
        }

        throw new Error(`Som não encontrado no registry: "${name}"`);
    }

    /**
     * playByName(name, loop?, pan?, vol?) → Promise<id>
     * Aceita nome semântico do registry OU url direta.
     */
    async function playByName(name, loop = 0, pan = null, vol = null) {
        const url = await resolve(name);
        return _MudAudio.play(url, loop, pan, vol);
    }

    /** getRegistry() — retorna cópia do registry carregado */
    async function getRegistry() {
        await _ensureRegistry();
        return { ..._MudAudio._registry };
    }

    Object.assign(_MudAudio, { loadRegistry, resolve, playByName, getRegistry });
})();
