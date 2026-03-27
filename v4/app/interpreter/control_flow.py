"""
Estruturas de controle de fluxo (if/for/end) para o interpretador send.
"""
from typing import Any, Dict, List


def collect_block(lines: List[str], start_index: int) -> tuple:
    """Coleta linhas até 'end'."""
    depth = 0
    block: List[str] = []
    i = start_index
    while i < len(lines):
        line = lines[i]
        if (line.startswith("if ") and line.endswith(" then")) or (
            line.startswith("for ") and line.endswith(" do")
        ):
            depth += 1
        elif line == "end":
            if depth == 0:
                break
            depth -= 1
        block.append(line)
        i += 1
    return block, i


def is_active(stack: List[Dict[str, Any]]) -> bool:
    """Verifica se bloco está ativo (todos os frames do stack são ativos)."""
    return all(item.get("active", True) for item in stack)
