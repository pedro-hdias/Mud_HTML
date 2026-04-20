"""
Resolução de variáveis e manipulação de strings para o interpretador send.
"""


def _escape_for_eval(value: object) -> str:
    """Escapa conteúdo dinâmico para uso seguro em expressões avaliadas."""
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\r", "")
        .replace("\n", "\\n")
    )


def resolve_vars(text: str, captures: list, *, escape_for_eval: bool = False) -> str:
    """Substitui variáveis %0, %1, %2, ... por capturas de regex."""
    resolved = text
    for idx, value in enumerate(captures):
        replacement = _escape_for_eval(value) if escape_for_eval else str(value)
        resolved = resolved.replace(f"%{idx}", replacement)
    return resolved


def strip_quotes(value: str) -> str:
    """Remove aspas de string literal."""
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        return value[1:-1]
    return value
