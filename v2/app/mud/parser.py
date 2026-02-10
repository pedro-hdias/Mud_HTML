from ..logger import get_logger

logger = get_logger("mud.parser")


def detect_disconnection(text: str) -> bool:
    """Detecta se o servidor enviou mensagem de desconexão"""
    detected = "*** Disconnected ***" in text
    if detected:
        logger.debug("Disconnection pattern detected")
    return detected

def detect_login_prompt(text: str) -> bool:
    """Detecta se o servidor está aguardando login"""
    text_lower = text.lower()
    detected = "play" in text_lower or "enter" in text_lower
    if detected:
        logger.debug("Login prompt pattern detected")
    return detected

def detect_input_prompt(text: str) -> bool:
    """Detecta se o servidor está aguardando input (login/senha)"""
    patterns = [
        "[Input]",
        "[input]",
        "name:",
        "login:",
        "password:",
        "senha:"
    ]
    text_lower = text.lower()
    detected = any(pattern.lower() in text_lower for pattern in patterns)
    if detected:
        logger.debug(f"Input prompt detected in text: {text[:50]}")
    return detected
