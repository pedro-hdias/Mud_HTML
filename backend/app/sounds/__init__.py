"""
Sistema de sons do Prometheus para MUD.

Exemplo:
    from app.sounds import get_sound_engine
    
    engine = get_sound_engine()
    events = engine.process_line("Você recebe 50 pontos de dano do tipo fogo.")
    # Retorna: [{"action": "play", "channel": "combat", "path": "..."}]
"""

from .engine import PrometheusSoundEngine, get_sound_engine
from .models import TriggerRule, SoundEvent
from .parser import load_rules, clear_rules_cache

__all__ = [
    "PrometheusSoundEngine",
    "get_sound_engine",
    "TriggerRule",
    "SoundEvent",
    "load_rules",
    "clear_rules_cache",
]
