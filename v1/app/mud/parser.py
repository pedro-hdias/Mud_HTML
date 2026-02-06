from ..logger import get_logger

logger = get_logger("mud.parser")


def detect_disconnection(text):
    """Detecta se o servidor enviou mensagem de desconexão"""
    detected = "*** Disconnected ***" in text
    if detected:
        logger.debug("Disconnection pattern detected")
    return detected

def detect_login_prompt(text):
    """Detecta se o servidor está aguardando login"""
    text_lower = text.lower()
    detected = "play" in text_lower or "enter" in text_lower
    if detected:
        logger.debug("Login prompt pattern detected")
    return detected
