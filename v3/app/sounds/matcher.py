"""
Compilação e normalização de regras (matchers).
"""

import re
from .models import TriggerRule
from ..logger import get_logger

logger = get_logger(__name__)


def compile_rule_matcher(rule: TriggerRule) -> re.Pattern:
    """Compila o matcher de uma regra (cria regex)."""
    if rule.compiled is not None:
        return rule.compiled

    pattern = rule.match or ""
    flags = re.IGNORECASE if rule.ignore_case else 0

    if rule.regexp:
        try:
            rule.compiled = re.compile(pattern, flags)
            return rule.compiled
        except re.error as e:
            logger.warning(f"Erro ao compilar regex '{pattern[:30]}...': {e}")
            rule.compiled = re.compile(r"$^")
            return rule.compiled

    try:
        regex_pattern = wildcard_to_regex(pattern)
        rule.compiled = re.compile(regex_pattern, flags)

        return rule.compiled
    except re.error as e:
        logger.warning(f"Erro ao compilar wildcard pattern '{pattern[:30]}...': {e}")
        rule.compiled = re.compile(r"$^")
        return rule.compiled


def wildcard_to_regex(pattern: str) -> str:
    """Converte wildcard do Lua para regex Python."""
    escaped = re.escape(pattern)
    escaped = escaped.replace(r"\*", "(.*)")
    escaped = escaped.replace(r"\?", "(.)")
    result = "^" + escaped + "$"

    return result


def normalize_line(line: str) -> str:
    """Normaliza linha removendo ANSI codes e newlines."""
    text = str(line or "")
    text = text.replace("\r", "").replace("\n", "")
    text = re.sub(r"\x1b\[[0-9;]*m", "", text)
    text = re.sub(r"\x1b\][^\x07]*\x07", "", text)
    return text
