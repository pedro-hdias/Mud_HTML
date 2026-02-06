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

    // Convenientes para credenciais
    saveCredentials(username, password, persistent = false) {
        const credentials = { username, password };
        if (persistent) {
            this.setCookie(CONFIG.STORAGE_KEYS.CREDENTIALS, JSON.stringify(credentials), CONFIG.COOKIE_EXPIRY_DAYS);
            this.removeItem(CONFIG.STORAGE_KEYS.CREDENTIALS);
            storageLogger.log("Credentials saved to cookie (persistent)");
        } else {
            this.setItem(CONFIG.STORAGE_KEYS.CREDENTIALS, JSON.stringify(credentials));
            storageLogger.log("Credentials saved to localStorage (session)");
        }
    },

    getCredentials() {
        try {
            // Tenta cookie primeiro (tem precedência)
            const cookieCreds = this.getCookie(CONFIG.STORAGE_KEYS.CREDENTIALS);
            if (cookieCreds) {
                return JSON.parse(cookieCreds);
            }
            // Depois localStorage
            const localCreds = this.getItem(CONFIG.STORAGE_KEYS.CREDENTIALS);
            if (localCreds) {
                return JSON.parse(localCreds);
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
    }
};
