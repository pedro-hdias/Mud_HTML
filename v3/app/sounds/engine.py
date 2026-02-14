"""
Motor de sons do Prometheus - orquestrador principal.
"""

import re
import random
from typing import Dict, List, Any

from .models import TriggerRule, SoundEvent
from .parser import load_rules, clear_rules_cache
from .matcher import compile_rule_matcher, normalize_line
from .interpreter import SendInterpreter
from .state import _Settings, _ConfigTable
from ..logger import get_logger

logger = get_logger(__name__)


class PrometheusSoundEngine:
    """Interpreta regras do Prometheus.xml e gera eventos de som."""
    
    def __init__(self, rules: List[TriggerRule] = None, seed: int = None):
        """
        Inicializa motor com regras e RNG.
        
        Args:
            rules: Lista de TriggerRule (se None, carrega do XML)
            seed: Seed para RNG
        """
        self._rules = rules or load_rules()
        self._rng = random.Random(seed)
        self._settings = _Settings()
        self._config_table = _ConfigTable(self._settings)
        self._last_line = ""
        
        logger.info(f"Motor de sons inicializado com {len(self._rules)} regras, seed={seed}")
        
        # Pré-compila todos os regras
        compiled_count = 0
        for rule in self._rules:
            compile_rule_matcher(rule)
            if rule.compiled:
                compiled_count += 1

    def process_line(self, line: str) -> List[Dict[str, Any]]:
        """
        Processa uma linha de MUD e retorna eventos de som.
        
        Args:
            line: Linha de texto do MUD
        
        Returns:
            Lista de eventos de som (dicts)
        """
        if not line.strip():
            return []
        
        self._last_line = line
        events: List[Dict[str, Any]] = []
        matched_rules = 0
        
        for rule_idx, rule in enumerate(self._rules):
            if not rule.enabled or not rule.match:
                continue
            
            matcher = compile_rule_matcher(rule)
            if not matcher:
                continue
            
            # Normalize before match
            normalized = normalize_line(line)
            matches = list(matcher.finditer(normalized))
            
            if not matches:
                continue
            
            matched_rules += 1
            
            # Processa cada match
            for match_idx, match in enumerate(matches):
                captures = [match.group(0)] + list(match.groups())
                rule_events = self._execute_rule(rule, captures)
                events.extend(rule_events)
        
        logger.info(f"Linha processada: {matched_rules} regras combinadas, {len(events)} eventos gerados")
        return events

    def _execute_rule(self, rule: TriggerRule, captures: List[str]) -> List[Dict[str, Any]]:
        """Executa send block de uma regra."""
        if not rule.send_text:
            return []
        
        variables = self._init_variables(captures)
        
        interpreter = SendInterpreter(
            captures=captures,
            variables=variables,
            settings=self._settings,
            config_table=self._config_table,
            rng=self._rng,
        )
        
        sound_events = interpreter.run(rule.send_text)
        
        # Converte para dicts para serialização JSON
        return [
            {
                "action": evt.get("action"),
                "channel": evt.get("channel"),
                "path": evt.get("path"),
                "delay_ms": evt.get("delay_ms", 0),
                "pan": evt.get("pan"),
                "volume": evt.get("volume", 100),
                "sound_id": evt.get("sound_id"),
                "target": evt.get("target"),
            }
            for evt in sound_events
        ]

    def _init_variables(self, captures: List[str]) -> Dict[str, Any]:
        """Inicializa variáveis para SendInterpreter."""
        return {
            "CurrentGlobalSound": None,
            "CurrentCombatSound": None,
            "settings": self._settings,
            "config": self._config_table,
        }

    def clear_cache(self) -> None:
        """Limpa cache de regras compiladas."""
        for rule in self._rules:
            rule.compiled = None
        clear_rules_cache()


def get_sound_engine(seed: int = None, settings: Dict[str, Any] = None) -> PrometheusSoundEngine:
    """
    Factory para criar uma instância de PrometheusSoundEngine.
    
    Args:
        seed: Seed para RNG (para testes)
        settings: Configurações iniciais (não usado ainda)
    
    Returns:
        Instância de PrometheusSoundEngine
    """
    engine = PrometheusSoundEngine(seed=seed)
    return engine
