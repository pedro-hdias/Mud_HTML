"""
Motor de sons do Prometheus - orquestrador principal.
"""

import re
import random
from typing import Dict, List, Any, Optional

from .models import TriggerRule, SoundEvent
from .parser import load_rules, clear_rules_cache
from .matcher import compile_rule_matcher, normalize_line
from ..interpreter import SendInterpreter
from .registry import get_registry
from ..interpreter.state import _Settings, _ConfigTable
from .core import (
    InternalTriggerRule,
    RuleActionExecutor,
    RuleMatch,
    RuleMatcher,
    RuleExecutionResult,
    RuleSource,
)
from ..config import AUDIO_DEBUG_DETAILS
from ..logger import get_logger

logger = get_logger(__name__)


class ParserRuleSource:
    """Adapter padrão para carregar regras via parser existente."""

    def load_rules(self) -> List[InternalTriggerRule]:
        legacy_rules = load_rules()
        return [InternalTriggerRule.from_trigger_rule(rule) for rule in legacy_rules]


class SendInterpreterActionExecutor:
    """Adapter padrão para executar send_text via SendInterpreter existente."""

    def __init__(self, settings: _Settings, config_table: _ConfigTable):
        self._settings = settings
        self._config_table = config_table

    def execute(
        self,
        rule: InternalTriggerRule,
        captures: List[str],
        variables: Dict[str, Any],
        rng: random.Random,
    ) -> RuleExecutionResult:
        if not rule.send_text:
            return RuleExecutionResult(events=[], rewritten_text=None)

        interpreter = SendInterpreter(
            captures=captures,
            variables=variables,
            settings=self._settings,
            config_table=self._config_table,
            rng=rng,
        )

        sound_events = interpreter.run(rule.send_text)
        rewritten_text = interpreter.get_rewritten_text()

        events = [
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

        return RuleExecutionResult(events=events, rewritten_text=rewritten_text)


class RegexRuleMatcher:
    """Matcher padrão baseado em regex/wildcard, com cache por regra."""

    def __init__(self) -> None:
        self._matcher_cache: Dict[int, re.Pattern] = {}

    def get_matches(self, rule: InternalTriggerRule, normalized_line: str) -> List[RuleMatch]:
        rule_id = id(rule)
        matcher = self._matcher_cache.get(rule_id)

        if not matcher:
            matcher = compile_rule_matcher(rule)
            if matcher:
                self._matcher_cache[rule_id] = matcher
            else:
                return []

        return [
            RuleMatch(captures=[match.group(0)] + list(match.groups()))
            for match in matcher.finditer(normalized_line)
        ]

    def clear_cache(self) -> None:
        self._matcher_cache.clear()


class PrometheusSoundEngine:
    """Interpreta regras do Prometheus.xml e gera eventos de som."""
    
    def __init__(
        self,
        rules: List[TriggerRule] = None,
        seed: int = None,
        rule_source: RuleSource = None,
        action_executor: RuleActionExecutor = None,
        rule_matcher: RuleMatcher = None,
    ):
        """
        Inicializa motor com regras e RNG.
        
        Args:
            rules: Lista de TriggerRule (se None, carrega do XML)
            seed: Seed para RNG
        """
        if rules is not None:
            self._rules = [InternalTriggerRule.from_trigger_rule(rule) for rule in rules]
        else:
            source = rule_source or ParserRuleSource()
            self._rules = source.load_rules()
        self._rng = random.Random(seed)
        self._settings = _Settings()
        self._config_table = _ConfigTable(self._settings)
        self._action_executor = action_executor or SendInterpreterActionExecutor(
            settings=self._settings,
            config_table=self._config_table,
        )
        self._rule_matcher = rule_matcher or RegexRuleMatcher()
        self._last_line = ""
        self._registry = get_registry()
        self._last_should_omit = False  # Flag de omissão da última linha processada
        self._last_rewritten_text: Optional[str] = None  # Texto reescrito da última linha
        
        logger.info(f"Motor de sons inicializado com {len(self._rules)} regras, seed={seed}")
        
        # Pré-compila todos as regras e armazena em cache
        compiled_count = 0
        for rule in self._rules:
            self._rule_matcher.get_matches(rule, "")
            if rule.compiled is not None:
                compiled_count += 1
        
        logger.info(f"✓ Cache de matchers compilados: {compiled_count}/{len(self._rules)} regras")
        
        # Diagnóstico: Contar triggers por categoria
        self._log_trigger_diagnostics()

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
        self._last_should_omit = False  # Reset flags para essa linha
        self._last_rewritten_text = None
        events: List[Dict[str, Any]] = []
        matched_rules = 0
        
        # Normalize once at the beginning
        normalized = normalize_line(line)
        
        for rule in self._rules:
            if not rule.enabled or not rule.match:
                continue
            
            matches = self._rule_matcher.get_matches(rule, normalized)
            
            if not matches:
                continue
            
            matched_rules += 1
            
            # Se essa regra tem omit_from_output, marca para omissão
            if rule.omit_from_output:
                self._last_should_omit = True
            
            # Processa cada match
            for matched in matches:
                rule_events, rewritten_text = self._execute_rule(rule, matched.captures)
                events.extend(rule_events)
                
                # Se há texto reescrito, armazena
                if rewritten_text:
                    self._last_rewritten_text = rewritten_text

            # Comportamento compatível com MUSHclient:
            # por padrão, para no primeiro trigger que casar, a menos que
            # keep_evaluating esteja explicitamente habilitado.
            if not rule.keep_evaluating:
                break
        
        logger.debug(f"Linha processada: {matched_rules} regras combinadas, {len(events)} eventos gerados")
        return events

    def get_last_omit_status(self) -> bool:
        """Retorna se a última linha processada deve ser omitida do output."""
        return self._last_should_omit
    
    def get_last_rewritten_text(self) -> Optional[str]:
        """Retorna o texto reescrito da última linha processada (via Note())."""
        return self._last_rewritten_text

    def _execute_rule(self, rule: InternalTriggerRule, captures: List[str]) -> tuple:
        """
        Executa send block de uma regra.
        
        Returns:
            Tupla (events, rewritten_text)
        """
        variables = self._init_variables(captures)
        result = self._action_executor.execute(
            rule=rule,
            captures=captures,
            variables=variables,
            rng=self._rng,
        )
        return result.events, result.rewritten_text

    def _init_variables(self, captures: List[str]) -> Dict[str, Any]:
        """Inicializa variáveis para SendInterpreter."""
        return {
            "CurrentGlobalSound": None,
            "CurrentCombatSound": None,
            "settings": self._settings,
            "config": self._config_table,
        }
    
    def _log_trigger_diagnostics(self) -> None:
        """Registra diagnóstico de triggers carregados."""
        # Contar triggers por categoria de som
        categories = {
            "ambient": 0,
            "combat": 0,
            "social": 0,
            "channel": 0,
            "other": 0,
        }
        
        disabled = 0
        
        for rule in self._rules:
            if not rule.enabled:
                disabled += 1
                continue
            
            send_text = rule.send_text or ""
            
            if "General/Rooms" in send_text or "Ambient" in rule.match:
                categories["ambient"] += 1
            elif "Combat" in send_text or "Ground/Fight" in send_text:
                categories["combat"] += 1
            elif "Socials" in send_text:
                categories["social"] += 1
            elif "Channels" in send_text:
                categories["channel"] += 1
            else:
                categories["other"] += 1
        
        # Log detalhado
        logger.info(f"Triggers por categoria:")
        logger.info(f"  • Ambiente (Rooms): {categories['ambient']}")
        logger.info(f"  • Combate: {categories['combat']}")
        logger.info(f"  • Sociais: {categories['social']}")
        logger.info(f"  • Canais: {categories['channel']}")
        logger.info(f"  • Outros: {categories['other']}")
        logger.info(f"  • Desativados: {disabled}")
        
        # Log de registry
        registry_stats = self._registry.get_stats()
        logger.info(f"Sound Registry: {registry_stats['total_files']} arquivos de áudio encontrados")
        if AUDIO_DEBUG_DETAILS:
            logger.info(f"Sound Registry (debug) por categoria: {registry_stats['categories']}")

    def clear_cache(self) -> None:
        """Limpa cache de regras compiladas."""
        for rule in self._rules:
            rule.compiled = None
        clear_rules_cache()
        self._rule_matcher.clear_cache()
        logger.info("✓ Cache de matchers limpo")
    
    # ========== MÉTRICAS DE PERFORMANCE ==========
    
    def get_performance_stats(self) -> Dict[str, Any]:
        """
        Retorna estatísticas de performance do motor.
        
        Returns:
            Dict com metrics de cache, regras, etc
        """
        import time
        
        cache_size = len(self._matcher_cache)
        total_rules = len(self._rules)
        compilation_ratio = (cache_size / total_rules * 100) if total_rules > 0 else 0
        
        return {
            "total_rules": total_rules,
            "cached_matchers": cache_size,
            "cache_coverage": f"{compilation_ratio:.1f}%",
            "last_line_processed": self._last_line[:50] if self._last_line else None,
            "registry_stats": self._registry.get_stats(),
            "timestamp": time.time(),
        }
    
    def get_diagnostic_report(self) -> str:
        """Retorna relatório completo de diagnóstico do motor."""
        stats = self.get_performance_stats()
        
        lines = [
            "=" * 70,
            "PROMETHEUS SOUND ENGINE - DIAGNOSTIC REPORT",
            "=" * 70,
            f"Regras carregadas: {stats['total_rules']}",
            f"Matchers em cache: {stats['cached_matchers']}/{stats['total_rules']} ({stats['cache_coverage']})",
            f"Arquivos de som: {stats['registry_stats']['total_files']}",
            f"Categorias de som: {stats['registry_stats']['total_categories']}",
            "",
            "Cache de Matchers Compilados:",
            f"  • Hits: Matchers reutilizados em cada linha processada",
            f"  • Cobre: {stats['cache_coverage']} das regras",
            "",
            "Categorias de Som:",
        ]
        
        for cat, count in sorted(stats['registry_stats']['categories'].items()):
            lines.append(f"  • {cat}: {count} sons")
        
        lines.extend([
            "",
            "=" * 70,
        ])
        
        return "\n".join(lines)


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
