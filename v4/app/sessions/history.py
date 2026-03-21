"""
SessionHistory - Gerencia o histórico de linhas da sessão MUD
"""


class SessionHistory:
    """Gerencia o histórico de linhas da sessão."""

    def __init__(self, max_bytes: int = 0, max_lines: int = 0):
        """
        Args:
            max_bytes: Limite máximo de bytes do histórico (0 = sem limite).
            max_lines: Limite máximo de linhas do histórico (0 = sem limite).
        """
        self._content: str = ""
        self._max_bytes: int = max_bytes or 0
        self._max_lines: int = max_lines or 0

    @property
    def content(self) -> str:
        """Conteúdo atual do histórico."""
        return self._content

    def append(self, text: str) -> None:
        """Adiciona texto ao histórico com trimming automático."""
        if not text:
            return

        self._content += text

        if self._max_bytes and len(self._content) > self._max_bytes:
            self._content = self._content[-self._max_bytes:]

        if self._max_lines:
            lines = self._content.splitlines(keepends=True)
            if len(lines) > self._max_lines:
                self._content = "".join(lines[-self._max_lines:])

    def get_recent(self, num_lines: int = 25) -> str:
        """Retorna as últimas N linhas do histórico."""
        if not self._content:
            return ""

        lines = self._content.split("\n")
        start_idx = max(0, len(lines) - num_lines)
        return "\n".join(lines[start_idx:])

    def get_slice(self, from_line_index: int, num_lines: int = 25) -> dict:
        """
        Retorna um slice de histórico anterior ao from_line_index.
        Usado para carregar histórico antigo (lazy loading).

        Args:
            from_line_index: índice (do fim) a partir do qual carregar histórico anterior.
            num_lines: número de linhas a carregar.

        Returns:
            dict com 'content', 'total_lines', 'has_more', 'from_line_index', 'returned_lines'.
        """
        if not self._content:
            return {
                "content": "",
                "total_lines": 0,
                "has_more": False,
                "from_line_index": 0,
                "returned_lines": 0,
            }

        from_line_index = max(0, int(from_line_index or 0))
        num_lines = max(1, int(num_lines or 25))

        lines = self._content.split("\n")
        total = len(lines)

        # from_line_index é contado do final: 0 = últimas linhas, 1 = penúltima, etc.
        start_idx = max(0, total - from_line_index - num_lines)
        end_idx = max(0, total - from_line_index)

        if start_idx >= end_idx:
            return {
                "content": "",
                "total_lines": total,
                "has_more": False,
                "from_line_index": from_line_index,
                "returned_lines": 0,
            }

        slice_lines = lines[start_idx:end_idx]
        has_more = start_idx > 0

        return {
            "content": "\n".join(slice_lines),
            "total_lines": total,
            "has_more": has_more,
            "from_line_index": from_line_index + len(slice_lines),
            "returned_lines": len(slice_lines),
        }

    def clear(self) -> None:
        """Limpa todo o histórico."""
        self._content = ""
