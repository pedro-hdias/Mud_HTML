"""
Preparação de linhas do bloco send para execução.
"""
from typing import List


def prepare_lines(send_text: str) -> List[str]:
    """Prepara linhas para execução (remove comentários, tags, etc)."""
    lines: List[str] = []
    for raw in send_text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("<send>") or line.startswith("</send>"):
            continue
        if line.startswith("--"):
            continue
        if "/*" in line or "*/" in line:
            continue
        lines.append(line)
    return lines
