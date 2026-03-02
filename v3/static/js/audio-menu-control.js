/**
 * audio-menu-control.js — Menu de controle de áudio avançado
 * 
 * Gerencia:
 * - Toggle Auto-play sounds
 * - Mute/Unmute rápido
 * - Status de áudio em tempo real
 * - Keyboard shortcuts (M para mute)
 */

(function () {
    const audioLogger = createLogger("audio-menu");

    // Elementos do DOM
    const btnAudioMenu = document.getElementById("btnAudioMenu");
    const audioMenu = document.getElementById("audioMenu");
    const checkAutoPlay = document.getElementById("checkAutoPlay");
    const btnQuickMute = document.getElementById("btnQuickMute");
    const infoVolume = document.getElementById("infoVolume");
    const infoActiveSounds = document.getElementById("infoActiveSounds");

    if (!btnAudioMenu || !audioMenu) {
        audioLogger.error("Audio menu elements not found in DOM");
        return;
    }

    let isMenuOpen = false;

    /**
     * Abre/fecha o menu de áudio
     */
    function toggleAudioMenu() {
        isMenuOpen = !isMenuOpen;
        audioMenu.hidden = !isMenuOpen;
        btnAudioMenu.setAttribute("aria-expanded", isMenuOpen.toString());

        if (isMenuOpen) {
            updateAudioMenuStatus();
        }
    }

    /**
     * Fecha o menu
     */
    function closeAudioMenu() {
        isMenuOpen = false;
        audioMenu.hidden = true;
        btnAudioMenu.setAttribute("aria-expanded", "false");
    }

    /**
     * Atualiza status do auto-play no menu
     */
    function updateAutoPlayStatus() {
        if (typeof SoundInterceptor === "undefined" || !SoundInterceptor) {
            // SoundInterceptor não está disponível - desabilitar checkbox
            checkAutoPlay.disabled = true;
            checkAutoPlay.checked = false;
            audioLogger.log("SoundInterceptor not available - checkbox disabled");
            return;
        }

        // Habilitar checkbox se SoundInterceptor está disponível
        checkAutoPlay.disabled = false;

        // Tenta obter status de auto-play
        let isEnabled = false;
        if (typeof SoundInterceptor.isAutoPlayEnabled === "function") {
            isEnabled = SoundInterceptor.isAutoPlayEnabled();
        } else if (typeof SoundInterceptor._autoPlayEnabled !== "undefined") {
            isEnabled = SoundInterceptor._autoPlayEnabled;
        }

        checkAutoPlay.checked = isEnabled;
        audioLogger.log("Auto-play status updated:", isEnabled);
    }

    /**
     * Toggle auto-play sounds
     */
    function toggleAutoPlay() {
        if (typeof SoundInterceptor === "undefined" || !SoundInterceptor || !SoundInterceptor.toggleAutoPlay) {
            audioLogger.warn("SoundInterceptor not available - auto-play cannot be toggled");
            // Reverter checkbox para estado anterior
            checkAutoPlay.checked = false;
            return;
        }

        const isNowEnabled = SoundInterceptor.toggleAutoPlay();
        checkAutoPlay.checked = isNowEnabled;
        audioLogger.log("Auto-play toggled:", isNowEnabled);
        updateAudioMenuStatus();
    }

    /**
     * Quick mute toggle
     */
    function quickMute() {
        if (typeof _MudAudio === "undefined") {
            audioLogger.warn("MudAudio not available");
            return;
        }

        _MudAudio.toggleMute();
        const isMuted = _MudAudio.isMuted();
        btnQuickMute.textContent = isMuted ? "🔇 Unmute (Key: M)" : "🔊 Mute (Key: M)";
        audioLogger.log("Mute toggled:", isMuted);
        updateAudioMenuStatus();
    }

    /**
     * Atualiza informações do menu
     */
    function updateAudioMenuStatus() {
        // Volume
        if (typeof _MudAudio !== "undefined") {
            const vol = _MudAudio.getVolume();
            infoVolume.textContent = vol + "%";

            // Active sounds count
            const state = _MudAudio.getActiveSounds?.();
            if (state && Array.isArray(state)) {
                infoActiveSounds.textContent = state.length;
            }
        }

        // Auto-play status
        updateAutoPlayStatus();

        // Mute button text
        if (typeof _MudAudio !== "undefined") {
            const isMuted = _MudAudio.isMuted?.();
            btnQuickMute.textContent = isMuted ? "🔇 Unmute (Key: M)" : "🔊 Mute (Key: M)";
        }
    }

    /**
     * Fechar menu ao clicar fora
     */
    document.addEventListener("click", function (e) {
        if (!btnAudioMenu.contains(e.target) && !audioMenu.contains(e.target)) {
            closeAudioMenu();
        }
    });

    /**
     * Fechar menu ao pressionar Escape
     */
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            closeAudioMenu();
        }

        // Keyboard shortcut: M para mute
        // Validar que e.key existe antes de chamar toLowerCase()
        if (e.key && e.key.toLowerCase() === "m" && !e.ctrlKey && !e.metaKey) {
            const input = document.activeElement;
            // Não ativa se estiver digitando em um input
            if (input.tagName !== "INPUT" || input.type !== "text") {
                e.preventDefault();
                quickMute();
            }
        }
    });

    /**
     * Event listeners
     */
    btnAudioMenu.addEventListener("click", toggleAudioMenu);
    checkAutoPlay.addEventListener("change", toggleAutoPlay);
    btnQuickMute.addEventListener("click", quickMute);

    // Atualizar status periodicamente
    setInterval(updateAudioMenuStatus, 500);

    // Inicializar
    updateAudioMenuStatus();
    audioLogger.log("Audio menu control initialized");
})();
