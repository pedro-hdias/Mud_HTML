"""
Parser de Prometheus.xml.
"""

import os
import re
from pathlib import Path
from typing import Dict, List, Any, Optional

from .models import TriggerRule
from ..logger import get_logger

logger = get_logger(__name__)

_rules_cache: Optional[List[TriggerRule]] = None


def load_rules() -> List[TriggerRule]:
    """Carrega regras do Prometheus.xml (com cache)."""
    global _rules_cache
    if _rules_cache is not None:
        return _rules_cache

    xml_path = _rules_path()
    logger.info(f"Carregando regras do arquivo: {xml_path}")
    
    try:
        text = xml_path.read_text(encoding="iso-8859-1", errors="replace")
    except Exception as e:
        logger.error(f"Erro ao ler arquivo XML {xml_path}: {e}", exc_info=True)
        return []
    
    rules: List[TriggerRule] = []

    trigger_start_re = re.compile(r"<trigger\b")
    trigger_end_re = re.compile(r"</trigger>")
    attr_re = re.compile(r"(\w+)=(\"[^\"]*\")")

    current: Optional[Dict[str, Any]] = None
    trigger_count = 0
    for line in text.splitlines():
        if trigger_start_re.search(line):
            if current:
                rules.append(_build_rule(current))
            current = {"attrs": {}, "body_lines": []}
            trigger_count += 1
        if current is not None:
            current["body_lines"].append(line)
            for key, val in attr_re.findall(line):
                current["attrs"][key] = val.strip('"')
            if trigger_end_re.search(line):
                rules.append(_build_rule(current))
                current = None

    if current:
        rules.append(_build_rule(current))

    _rules_cache = rules
    logger.info(f"Carregamento concluído: {len(rules)} regras parseadas de {trigger_count} triggers")
    return rules


def clear_cache() -> None:
    """Limpa cache de regras (útil para testes)."""
    global _rules_cache
    _rules_cache = None


def _rules_path() -> Path:
    """Retorna caminho do Prometheus.xml."""
    env_path = os.environ.get("SOUNDS_RULES_PATH")
    if env_path:
        return Path(env_path)
    return Path(__file__).resolve().parent / "Prometheus.xml"


def _build_rule(raw: Dict[str, Any]) -> TriggerRule:
    """Constrói uma regra a partir de dados brutos parseados."""
    attrs = raw.get("attrs", {})
    body_lines = raw.get("body_lines", [])
    
    match = attrs.get("match") or _extract_attr(body_lines, "match") or ""
    regexp = (attrs.get("regexp") or _extract_attr(body_lines, "regexp") or "").lower() == "y"
    ignore_case = (attrs.get("ignore_case") or _extract_attr(body_lines, "ignore_case") or "").lower() == "y"
    enabled = (attrs.get("enabled") or "y").lower() == "y"
    sequence = int(attrs.get("sequence") or _extract_attr(body_lines, "sequence") or 0)
    send_to = attrs.get("send_to") or _extract_attr(body_lines, "send_to")
    send_text = _extract_send_text(body_lines)
    
    rule = TriggerRule(
        enabled=enabled,
        match=match,
        regexp=regexp,
        ignore_case=ignore_case,
        sequence=sequence,
        send_text=send_text,
        send_to=send_to,
        compiled=None,
    )
    

    return rule


def _extract_attr(lines: List[str], name: str) -> Optional[str]:
    """Extrai atributo de linhas de corpo."""
    pattern = re.compile(r"%s=(\"[^\"]*\")" % re.escape(name))
    for line in lines:
        m = pattern.search(line)
        if m:
            return m.group(1).strip('"')
    return None


def _extract_send_text(lines: List[str]) -> str:
    """Extrai bloco <send>...</send>."""
    send_lines: List[str] = []
    in_send = False
    for line in lines:
        if "<send>" in line:
            in_send = True
        if in_send:
            send_lines.append(line)
        if "</send>" in line:
            in_send = False
    return "\n".join(send_lines)


def clear_rules_cache() -> None:
    """Limpa o cache global de regras."""
    global _rules_cache
    _rules_cache = None
