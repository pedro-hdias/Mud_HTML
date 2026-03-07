"""
Funções executáveis do interpretador send: geração de IDs, emissão de eventos,
tratamento de Note() e DoAfterSpecial().
"""
from typing import Any, Callable, Dict, List, Optional

from ...logger import get_logger
from .evaluator import split_args

logger = get_logger(__name__)


def next_sound_id(variables: dict) -> str:
    """Gera ID único para som, incrementando o contador em variáveis."""
    variables.setdefault("_sound_id_counter", 0)
    variables["_sound_id_counter"] += 1
    return f"s{variables['_sound_id_counter']}"


def emit_sound_event(
    path: Optional[str],
    channel: str,
    pan: Optional[int],
    delay_ms: int,
    variables: dict,
    events: list,
    source: str = "normal",
) -> None:
    """
    Emite evento de som para a fila de eventos.

    Args:
        path: Caminho normalizado do som (ou None se não encontrado)
        channel: Canal (global, combat, etc)
        pan: Panning value
        delay_ms: Delay em ms
        variables: Dicionário de variáveis de execução
        events: Lista de eventos onde o evento será adicionado
        source: Origem do evento (normal, fallback, etc)
    """
    sound_id = next_sound_id(variables)

    event = {
        "action": "play",
        "channel": channel,
        "path": path,
        "delay_ms": delay_ms,
        "pan": pan,
        "volume": 100,
        "sound_id": sound_id,
        "target": None,
        "source": source,
    }

    target_var = "CurrentGlobalSound" if channel == "global" else "CurrentCombatSound"
    variables[target_var] = sound_id
    events.append(event)

    logger.debug(
        f"[SoundEvent] Emitido: source={source}, path={path}, "
        f"channel={channel}, sound_id={sound_id}"
    )


def handle_note(line: str, strip_quotes_fn: Callable, set_note_fn: Callable) -> None:
    """
    Processa Note() para reexibir texto.

    Args:
        line: Linha completa da instrução Note(...)
        strip_quotes_fn: Função para remover aspas de string literal
        set_note_fn: Função para definir o texto reexibido (ex: self.Note)
    """
    inner = line[len("Note("):-1].strip()
    if not inner:
        return

    text = strip_quotes_fn(inner)
    set_note_fn(text)


def handle_do_after_special(
    line: str,
    eval_value_fn: Callable,
    strip_quotes_fn: Callable,
    execute_lines_fn: Callable,
) -> None:
    """
    Processa DoAfterSpecial(delay, action) — executa action após delay.

    Args:
        line: Linha completa da instrução DoAfterSpecial(...)
        eval_value_fn: Função para avaliar expressões
        strip_quotes_fn: Função para remover aspas de string literal
        execute_lines_fn: Função para executar linhas com delay_ms
    """
    inner = line[len("DoAfterSpecial("):-1]
    args = split_args(inner)
    if len(args) < 2:
        return
    delay_seconds = float(eval_value_fn(args[0]) or 0)
    action_code = strip_quotes_fn(args[1])
    delay_ms = int(delay_seconds * 1000)
    execute_lines_fn([action_code], delay_ms=delay_ms)
