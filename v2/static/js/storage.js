/**
 * storage.js - Gerenciamento de armazenamento
 * Abstração para cookies e localStorage
 */

const storageLogger = createLogger("storage");

const StorageManager = {
    // Gerenciamento de cookies
    setCookie(name, value, days = CONFIG.COOKIE_EXPIRY_DAYS) {
        try {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            const expires = "expires=" + date.toUTCString();
            document.cookie = `${name}=${encodeURIComponent(value)};${expires};path=/;SameSite=Lax`;
            storageLogger.log("Cookie set", { name, days });
        } catch (e) {
            storageLogger.error("Error setting cookie", e);
        }
    },

    getCookie(name) {
        try {
            const nameEQ = name + "=";
            const ca = document.cookie.split(';');
            for (let i = 0; i < ca.length; i++) {
                let c = ca[i].trim();
                if (c.indexOf(nameEQ) === 0) {
                    return decodeURIComponent(c.substring(nameEQ.length));
                }
            }
            return null;
        } catch (e) {
            storageLogger.error("Error getting cookie", e);
            return null;
        }
    },

    deleteCookie(name) {
        try {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
            storageLogger.log("Cookie deleted", { name });
        } catch (e) {
            storageLogger.error("Error deleting cookie", e);
        }
    },

    // Gerenciamento de localStorage
    setItem(key, value) {
        try {
            localStorage.setItem(key, value);
            storageLogger.log("LocalStorage set", { key });
        } catch (e) {
            storageLogger.error("Error setting localStorage", e);
        }
    },

    getItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            storageLogger.error("Error getting localStorage", e);
            return null;
        }
    },

    removeItem(key) {
        try {
            localStorage.removeItem(key);
            storageLogger.log("LocalStorage removed", { key });
        } catch (e) {
            storageLogger.error("Error removing localStorage", e);
        }
    },

    // Ofuscação simples para não armazenar credenciais em texto puro
    // Não é criptografia forte — impede apenas leitura casual/trivial
    _obfuscate(text) {
        try {
            return btoa(text.split("").reverse().join(""));
        } catch (e) {
            storageLogger.error("Obfuscation error", e);
            return btoa(text);
        }
    },

    _deobfuscate(encoded) {
        try {
            return atob(encoded).split("").reverse().join("");
        } catch (e) {
            storageLogger.error("Deobfuscation error", e);
            return null;
        }
    },

    // Convenientes para credenciais
    saveCredentials(username, password, persistent = false) {
        const credentials = {
            u: this._obfuscate(username),
            p: this._obfuscate(password),
            _v: 2  // versão do formato (para migração futura)
        };
        const encoded = JSON.stringify(credentials);
        if (persistent) {
            this.setCookie(CONFIG.STORAGE_KEYS.CREDENTIALS, encoded, CONFIG.COOKIE_EXPIRY_DAYS);
            this.removeItem(CONFIG.STORAGE_KEYS.CREDENTIALS);
            storageLogger.log("Credentials saved to cookie (persistent, obfuscated)");
        } else {
            this.setItem(CONFIG.STORAGE_KEYS.CREDENTIALS, encoded);
            storageLogger.log("Credentials saved to localStorage (session, obfuscated)");
        }
    },

    getCredentials() {
        try {
            let raw = null;
            // Tenta cookie primeiro (tem precedência)
            const cookieCreds = this.getCookie(CONFIG.STORAGE_KEYS.CREDENTIALS);
            if (cookieCreds) {
                raw = JSON.parse(cookieCreds);
            } else {
                // Depois localStorage
                const localCreds = this.getItem(CONFIG.STORAGE_KEYS.CREDENTIALS);
                if (localCreds) {
                    raw = JSON.parse(localCreds);
                }
            }
            if (!raw) return null;

            // Formato v2 (ofuscado)
            if (raw._v === 2) {
                const username = this._deobfuscate(raw.u);
                const password = this._deobfuscate(raw.p);
                if (!username || !password) {
                    storageLogger.error("Failed to deobfuscate credentials");
                    this.clearCredentials();
                    return null;
                }
                return { username, password };
            }

            // Formato legado (texto puro) — migra automaticamente
            if (raw.username && raw.password) {
                storageLogger.log("Migrating legacy credentials to obfuscated format");
                this.saveCredentials(raw.username, raw.password, !!this.getCookie(CONFIG.STORAGE_KEYS.CREDENTIALS));
                return { username: raw.username, password: raw.password };
            }

            return null;
        } catch (e) {
            storageLogger.error("Error parsing credentials", e);
            return null;
        }
    },

    clearCredentials() {
        this.removeItem(CONFIG.STORAGE_KEYS.CREDENTIALS);
        this.deleteCookie(CONFIG.STORAGE_KEYS.CREDENTIALS);
        storageLogger.log("Credentials cleared");
    },

    setLoggedIn(value) {
        this.setItem(CONFIG.STORAGE_KEYS.LOGGED_IN, value.toString());
    },

    isLoggedIn() {
        return this.getItem(CONFIG.STORAGE_KEYS.LOGGED_IN) === 'true';
    },

    setAllowLoginPrompt(value) {
        this.setItem(CONFIG.STORAGE_KEYS.ALLOW_LOGIN, value.toString());
    },

    isAllowLoginPrompt() {
        return this.getItem(CONFIG.STORAGE_KEYS.ALLOW_LOGIN) === 'true';
    },

    setWasConnected(value) {
        this.setItem(CONFIG.STORAGE_KEYS.WAS_CONNECTED, value.toString());
    },

    wasConnected() {
        return this.getItem(CONFIG.STORAGE_KEYS.WAS_CONNECTED) === 'true';
    },

    clearAll() {
        CONFIG.STORAGE_KEYS && Object.values(CONFIG.STORAGE_KEYS).forEach(key => {
            this.removeItem(key);
            this.deleteCookie(key);
        });
        storageLogger.log("All storage cleared");
    },

    // Gerenciamento de publicId
    generatePublicId() {
        // Gera UUID v4 simples
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    getOrCreatePublicId() {
        let publicId = this.getItem(CONFIG.STORAGE_KEYS.PUBLIC_ID);
        if (!publicId) {
            publicId = this.generatePublicId();
            this.setItem(CONFIG.STORAGE_KEYS.PUBLIC_ID, publicId);
            storageLogger.log("New publicId created", { publicId });
        } else {
            storageLogger.log("Existing publicId retrieved", { publicId });
        }
        return publicId;
    },

    clearPublicId() {
        this.removeItem(CONFIG.STORAGE_KEYS.PUBLIC_ID);
        storageLogger.log("publicId cleared");
    },

    setOwner(token) {
        this.setItem(CONFIG.STORAGE_KEYS.OWNER, token);
        storageLogger.log("Ownership token saved");
    },

    getOwner() {
        return this.getItem(CONFIG.STORAGE_KEYS.OWNER);
    },

    clearOwner() {
        this.removeItem(CONFIG.STORAGE_KEYS.OWNER);
        storageLogger.log("Ownership token cleared");
    },

    clearSession() {
        this.clearPublicId();
        this.clearOwner();
        storageLogger.log("Session fully cleared (ID + token)");
    }
};


