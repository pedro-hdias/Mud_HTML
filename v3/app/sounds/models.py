"""
Modelos de dados para o engine de sons Prometheus.
"""

from dataclasses import dataclass
from typing import Optional
import re


@dataclass
class SoundEvent:
    """Evento de som a ser emitido para o cliente."""
    action: str
    channel: Optional[str] = None
    path: Optional[str] = None
    delay_ms: int = 0
    pan: Optional[int] = None
    volume: Optional[int] = None
    sound_id: Optional[str] = None
    target: Optional[str] = None


@dataclass
class TriggerRule:
    """Regra desencadeadora do Prometheus.xml."""
    enabled: bool
    match: str
    regexp: bool
    ignore_case: bool
    keep_evaluating: bool
    sequence: int
    send_text: str
    send_to: Optional[str]
    compiled: Optional[re.Pattern] = None
    omit_from_output: bool = False  # Se True, linha não é exibida ao usuário
    omit_from_log: bool = False     # Se True, linha não é adicionada ao histórico
