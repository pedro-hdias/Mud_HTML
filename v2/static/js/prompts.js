/**
 * prompts.js - Detecção e processamento de prompts
 * Identifica prompts de confirmação e constrói mensagens
 */

const promptsLogger = createLogger("prompts");

const PromptDetector = {
    lastLineText: "",

    setLastLine(text) {
        this.lastLineText = text.trimEnd();
    },

    shouldShowConfirmPrompt(line) {
        try {
            const trimmed = line.trim();
            if (!trimmed) {
                return false;
            }
            return CONFIG.CONFIRM_PATTERNS.some(pattern => pattern.test(trimmed));
        } catch (e) {
            promptsLogger.error("Error checking confirm prompt", e);
            return false;
        }
    },

    buildConfirmMessage(line) {
        try {
            const trimmed = line.trim();
            const previous = this.lastLineText.trim();

            if (previous && previous !== trimmed) {
                return `${previous}\n${trimmed}`;
            }
            return trimmed;
        } catch (e) {
            promptsLogger.error("Error building confirm message", e);
            return trimmed;
        }
    }
};
