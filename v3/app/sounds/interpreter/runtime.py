"""
Contexto de execução de um bloco send.
"""
from typing import Any, Dict, List, Optional


class InterpreterRuntime:
    """Contexto de execução de um bloco send."""

    def __init__(
        self,
        captures: List[str],
        variables: Dict[str, Any],
        settings,
        config_table,
        rng,
    ):
        self.captures = captures
        self.variables = variables
        self.settings = settings
        self.config_table = config_table
        self.rng = rng
        self.events: List[Dict[str, Any]] = []
        self.rewritten_text: Optional[str] = None
