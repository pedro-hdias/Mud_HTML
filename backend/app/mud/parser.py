import re

from ..logger import get_logger

logger = get_logger("mud.parser")

_PASSWORD_PROMPT_PATTERNS = (
    re.compile(r"(?:^|\b)(?:password|senha|passwd)\s*[:?]\s*$", re.IGNORECASE),
    re.compile(r"(?:enter|type|digite|informe).*(?:password|senha|passwd)\s*[:?]?\s*$", re.IGNORECASE),
)

_USERNAME_PROMPT_PATTERNS = (
    re.compile(r"(?:^|\b)(?:username|user\s*name|login|name)\s*[:?]\s*$", re.IGNORECASE),
    re.compile(r"(?:enter|type|digite|informe).*(?:username|user\s*name|login|name)\s*[:?]?\s*$", re.IGNORECASE),
)


def detect_disconnection(text: str) -> bool:
    """Detecta se o servidor enviou mensagem de desconexão"""
    return "*** Disconnected ***" in text

def detect_login_prompt(text: str) -> bool:
    """Detecta se o servidor está aguardando login."""
    text_lower = text.lower()
    return "play" in text_lower or "enter" in text_lower


def detect_password_prompt(text: str) -> bool:
    """Detecta se o servidor está pedindo a senha do jogador."""
    text_clean = text.strip()
    return any(pattern.search(text_clean) for pattern in _PASSWORD_PROMPT_PATTERNS)


def detect_username_prompt(text: str) -> bool:
    """Detecta se o servidor está pedindo o username/login do jogador."""
    text_clean = text.strip()
    return any(pattern.search(text_clean) for pattern in _USERNAME_PROMPT_PATTERNS)


def detect_initial_login_menu(text: str) -> bool:
    """Detecta o menu inicial que exige escolher a opção de login existente."""
    text_lower = text.lower()
    return "valid commands are:" in text_lower and "[p] - log in to an existing character" in text_lower


def detect_input_prompt(text: str) -> bool:
    """Detecta se o servidor está aguardando input (login/senha)."""
    patterns = [
        "[input]",
        "name:",
        "username:",
        "login:",
    ]
    text_lower = text.lower()
    return any(pattern in text_lower for pattern in patterns) or detect_username_prompt(text) or detect_password_prompt(text)
