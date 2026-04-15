from ..logger import get_logger

logger = get_logger("mud.parser")


def detect_disconnection(text: str) -> bool:
    """Detecta se o servidor enviou mensagem de desconexão"""
    return "*** Disconnected ***" in text

def detect_login_prompt(text: str) -> bool:
    """Detecta se o servidor está aguardando login"""
    text_lower = text.lower()
    return "play" in text_lower or "enter" in text_lower

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
    return any(pattern.lower() in text_lower for pattern in patterns)
