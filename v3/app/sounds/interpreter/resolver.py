"""
Resolução de variáveis e manipulação de strings para o interpretador send.
"""


def resolve_vars(text: str, captures: list) -> str:
    """Substitui variáveis %0, %1, %2, ... por capturas de regex."""
    resolved = text
    for idx, value in enumerate(captures):
        # Usa repr() para escapar corretamente todos os caracteres especiais.
        # Isso previne SyntaxWarnings com sequências de escape inválidas.
        escaped_value = repr(value)
        # Remove as aspas externas adicionadas por repr()
        if escaped_value.startswith('"') and escaped_value.endswith('"'):
            escaped_value = escaped_value[1:-1]
        elif escaped_value.startswith("'") and escaped_value.endswith("'"):
            escaped_value = escaped_value[1:-1]
        resolved = resolved.replace(f"%{idx}", escaped_value)
    return resolved


def strip_quotes(value: str) -> str:
    """Remove aspas de string literal."""
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        return value[1:-1]
    return value
