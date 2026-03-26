"""
Contratos e modelo interno do motor de triggers.

Este módulo define o núcleo de tipos para permitir múltiplas fontes de regras
e múltiplos executores de ações, mantendo o comportamento existente.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Protocol
import random
import re

from .models import TriggerRule


@dataclass
class InternalTriggerRule:
    """Representação interna normalizada de regra de trigger."""

    enabled: bool
    match: str
    regexp: bool
    ignore_case: bool
    keep_evaluating: bool
    sequence: int
    send_text: str
    send_to: Optional[str]
    compiled: Optional[re.Pattern] = None
    omit_from_output: bool = False
    omit_from_log: bool = False

    @classmethod
    def from_trigger_rule(cls, rule: TriggerRule) -> "InternalTriggerRule":
        """Converte TriggerRule legado para o modelo interno."""
        return cls(
            enabled=rule.enabled,
            match=rule.match,
            regexp=rule.regexp,
            ignore_case=rule.ignore_case,
            keep_evaluating=rule.keep_evaluating,
            sequence=rule.sequence,
            send_text=rule.send_text,
            send_to=rule.send_to,
            compiled=rule.compiled,
            omit_from_output=rule.omit_from_output,
            omit_from_log=rule.omit_from_log,
        )


@dataclass
class RuleExecutionResult:
    """Resultado da execução de uma regra para uma captura."""

    events: List[Dict[str, Any]]
    rewritten_text: Optional[str]


@dataclass
class RuleMatch:
    """Representa um match de regra com capturas prontas para execução."""

    captures: List[str]


class RuleSource(Protocol):
    """Fonte de regras normalizadas para o motor."""

    def load_rules(self) -> List[InternalTriggerRule]:
        """Carrega e retorna regras normalizadas."""


class RuleActionExecutor(Protocol):
    """Executor de bloco send para uma regra já casada."""

    def execute(
        self,
        rule: InternalTriggerRule,
        captures: List[str],
        variables: Dict[str, Any],
        rng: random.Random,
    ) -> RuleExecutionResult:
        """Executa a ação da regra e retorna eventos e texto reescrito."""


class RuleMatcher(Protocol):
    """Responsável por avaliar uma regra contra uma linha normalizada."""

    def get_matches(self, rule: InternalTriggerRule, normalized_line: str) -> List[RuleMatch]:
        """Retorna os matches da regra para a linha (com capturas)."""

    def clear_cache(self) -> None:
        """Limpa cache interno do matcher, quando existir."""
