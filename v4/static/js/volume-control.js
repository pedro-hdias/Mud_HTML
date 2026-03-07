/**
 * volume-control.js — Controle de volume mestre global via slider
 * 
 * Gerencia o slider de volume na UI, sincroniza com _MudAudio.volume()
 * e persiste a preferência no localStorage.
 */

(function () {
    const volumeLogger = createLogger("volume-control");
    const STORAGE_KEY = "mud_master_volume";
    const DEFAULT_VOLUME = 100;

    // Elementos do DOM
    const slider = document.getElementById("volumeSlider");
    const valueDisplay = document.getElementById("volumeValue");

    if (!slider || !valueDisplay) {
        volumeLogger.error("Volume control elements not found in DOM");
        return;
    }

    /**
     * Aplica volume tanto na UI quanto no sistema de áudio
     */
    function applyVolume(volume) {
        const vol = Math.round(Math.max(0, Math.min(100, volume)));

        // Atualiza UI
        slider.value = vol;
        valueDisplay.textContent = vol + "%";

        // Atualiza atributos ARIA para acessibilidade
        slider.setAttribute("aria-valuenow", vol);
        slider.setAttribute("aria-label", `Master volume ${vol}%`);

        // Atualiza sistema de áudio
        if (typeof _MudAudio !== 'undefined' && _MudAudio.volume) {
            _MudAudio.volume(vol);
            volumeLogger.log("Volume set to", vol);
        }

        // Salva no localStorage
        StorageManager.setItem(STORAGE_KEY, vol.toString());
    }

    /**
     * Carrega volume salvo do localStorage
     */
    function loadSavedVolume() {
        const saved = StorageManager.getItem(STORAGE_KEY);
        if (saved !== null) {
            const vol = parseInt(saved, 10);
            if (!isNaN(vol)) {
                applyVolume(vol);
                volumeLogger.log("Loaded saved volume:", vol);
                return;
            }
        }

        // Se não há volume salvo, usa o padrão
        applyVolume(DEFAULT_VOLUME);
        volumeLogger.log("Using default volume:", DEFAULT_VOLUME);
    }

    /**
     * Event listener para mudanças no slider
     */
    slider.addEventListener("input", function () {
        const vol = parseInt(this.value, 10);
        applyVolume(vol);
    });

    // Carrega o volume salvo ao inicializar
    loadSavedVolume();

    volumeLogger.log("Volume control initialized");
})();
