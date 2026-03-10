"""
Resolução de variáveis e manipulação de strings para o interpretador send.
"""


def resolve_vars(text: str, captures: list) -> str:
    """Substitui variáveis %0, %1, %2, ... por capturas de regex."""
    resolved = text
    for idx, value in enumerate(captures):
        # Usa str(value) em vez de repr() para evitar barras invertidas extras
        # em caracteres como apóstrofos, que corrompem texto/linhas não avaliados.
        resolved = resolved.replace(f"%{idx}", str(value))
    return resolved


def strip_quotes(value: str) -> str:
    """Remove aspas de string literal."""
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        return value[1:-1]
    return value
