"""
Fachada do interpretador de blocos 'send' do Prometheus.xml.

A classe SendInterpreter delega operações puras aos submodulos especializados
e mantém a lógica de execução de fluxo de controle (if/for/end) centralizada.
"""
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..logger import get_logger
from .control_flow import collect_block, is_active
from .evaluator import eval_condition, eval_value, split_args, split_concat
from .functions import emit_sound_event, handle_do_after_special, handle_note, next_sound_id
from .path_validation import (
    get_fallback_sound,
    get_normalized_sound_path,
    find_file_case_insensitive,
    is_valid_channel_sound,
    is_valid_sound_path,
    sound_file_exists,
)
from .preprocessor import prepare_lines
from .resolver import resolve_vars, strip_quotes

logger = get_logger(__name__)


class SendInterpreter:
    """Executa blocos 'send' em contexto de captura de regex."""

    def __init__(
        self,
        captures: List[str],
        variables: Dict[str, Any],
        settings,
        config_table,
        rng,
    ):
        self._captures = captures
        self._variables = variables
        self._settings = settings
        self._config_table = config_table
        self._rng = rng
        self._events: List[Dict[str, Any]] = []
        self._rewritten_text: Optional[str] = None  # Texto reexibido via Note()

    # ──────────────────────────────────────────────
    # API pública
    # ──────────────────────────────────────────────

    def run(self, send_text: str, delay_ms: int = 0) -> List[Dict[str, Any]]:
        """Executa send_text e retorna lista de eventos."""
        if not send_text:
            return []

        lines = self._prepare_lines(send_text)
        self._execute_lines(lines, delay_ms=delay_ms)

        return self._events

    def get_rewritten_text(self) -> Optional[str]:
        """Retorna o texto reescrito via Note(), se houver."""
        return self._rewritten_text

    def Note(self, text: str) -> None:
        """
        Reexibe texto. Usado com omit_from_output=True para reformatar texto.

        Exemplo: Note("%0") reexibe o texto original
                 Note("[Camera] %1") reexibe com prefixo
        """
        resolved_text = self._resolve_vars(text)
        self._rewritten_text = resolved_text
        logger.debug(f"[Note] Texto reescrito: '{resolved_text}'")

    # ──────────────────────────────────────────────
    # Delegação a submodulos (wrappers finos)
    # ──────────────────────────────────────────────

    def _resolve_vars(self, text: str) -> str:
        return resolve_vars(text, self._captures)

    def _strip_quotes(self, value: str) -> str:
        return strip_quotes(value)

    def _prepare_lines(self, send_text: str) -> List[str]:
        return prepare_lines(send_text)

    def _eval_condition(self, cond: str) -> bool:
        return eval_condition(cond, self._captures, self._variables, self._settings, self._rng)

    def _eval_value(self, expr: str) -> Any:
        return eval_value(expr, self._captures, self._variables, self._settings, self._rng)

    def _split_args(self, args_str: str) -> List[str]:
        return split_args(args_str)

    def _split_concat(self, expr: str) -> List[str]:
        return split_concat(expr)

    def _collect_block(self, lines: List[str], start_index: int) -> tuple:
        return collect_block(lines, start_index)

    def _is_active(self, stack: List[Dict[str, Any]]) -> bool:
        return is_active(stack)

    def _is_valid_sound_path(self, path) -> bool:
        return is_valid_sound_path(path)

    def _is_valid_channel_sound(self, path) -> bool:
        return is_valid_channel_sound(path)

    def _get_fallback_sound(self, channel: str, requested_path: Optional[str] = None) -> Optional[str]:
        return get_fallback_sound(channel, self._get_normalized_sound_path, requested_path)

    def _sound_file_exists(self, path: Optional[str]) -> bool:
        return sound_file_exists(path)

    def _get_normalized_sound_path(self, path: Optional[str]) -> Optional[str]:
        return get_normalized_sound_path(path)

    def _find_file_case_insensitive(self, base_dir: Path, relative_path: str) -> Optional[Path]:
        return find_file_case_insensitive(base_dir, relative_path)

    def _next_sound_id(self) -> str:
        return next_sound_id(self._variables)

    def _emit_sound_event(
        self, path: str, channel: str, pan: Optional[int], delay_ms: int, source: str = "normal"
    ) -> None:
        emit_sound_event(path, channel, pan, delay_ms, self._variables, self._events, source)

    # ──────────────────────────────────────────────
    # Lógica de execução (mantida centralizada)
    # ──────────────────────────────────────────────

    def _execute_lines(self, lines: List[str], delay_ms: int = 0) -> None:
        """Executa múltiplas linhas com suporte a if/for/end."""
        i = 0
        stack: List[Dict[str, Any]] = []

        while i < len(lines):
            line = lines[i]

            if line.startswith("for ") and line.endswith(" do"):
                if self._is_active(stack):
                    i = self._handle_for_block(lines, i, delay_ms)
                    continue
                i += 1
                continue

            if line.startswith("if ") and line.endswith(" then"):
                cond = line[3:-5].strip()
                result = self._eval_condition(cond)
                stack.append(
                    {"type": "if", "parent": self._is_active(stack), "active": result, "executed": result}
                )
                i += 1
                continue

            if line.startswith("elseif ") and line.endswith(" then"):
                cond = line[7:-5].strip()
                if not stack:
                    i += 1
                    continue
                top = stack[-1]
                if not top["parent"] or top["executed"]:
                    top["active"] = False
                else:
                    result = self._eval_condition(cond)
                    top["active"] = result
                    top["executed"] = result
                i += 1
                continue

            if line == "else":
                if stack:
                    top = stack[-1]
                    if not top["parent"] or top["executed"]:
                        top["active"] = False
                    else:
                        top["active"] = True
                        top["executed"] = True
                i += 1
                continue

            if line == "end":
                if stack:
                    stack.pop()
                i += 1
                continue

            if not self._is_active(stack):
                i += 1
                continue

            if line == "return" or line.startswith("return "):
                return

            self._execute_statement(line, delay_ms=delay_ms)
            i += 1

    def _handle_for_block(self, lines: List[str], start_index: int, delay_ms: int) -> int:
        """Executa bloco for."""
        line = lines[start_index]
        match = re.match(r"for\s+(\w+)\s*=\s*([^,]+),\s*([^\s]+)\s+do", line)
        if not match:
            return start_index + 1

        var_name = match.group(1)
        start_val = int(self._eval_value(match.group(2)))
        end_val = int(self._eval_value(match.group(3)))

        block_lines, end_index = self._collect_block(lines, start_index + 1)
        for value in range(start_val, end_val + 1):
            self._variables[var_name] = value
            self._execute_lines(block_lines, delay_ms=delay_ms)
        return end_index + 1

    def _execute_statement(self, line: str, delay_ms: int) -> None:
        """Executa uma declaração (atribuição ou função)."""
        line = self._resolve_vars(line)

        if line.startswith("Note("):
            handle_note(line, self._strip_quotes, self.Note)
            return

        if line.startswith("Execute("):
            return

        if line.startswith("DoAfterSpecial("):
            handle_do_after_special(
                line,
                self._eval_value,
                self._strip_quotes,
                lambda lines, delay_ms: self._execute_lines(lines, delay_ms=delay_ms),
            )
            return

        assign_match = re.match(r"(\w+)\s*=\s*(.+)", line)
        if assign_match:
            var_name = assign_match.group(1)
            expr = assign_match.group(2)

            func_match = re.match(r"(\w+)\((.*)\)", expr)
            if func_match and func_match.group(1) in ("PlayGlobalSound", "PlayCombatSound"):
                func = func_match.group(1)
                args = self._split_args(func_match.group(2))
                self._call_function(func, args, delay_ms, assign_to=var_name)
                return

            value = self._eval_value(expr)
            self._variables[var_name] = value
            return

        func_match = re.match(r"(\w+)\((.*)\)", line)
        if func_match:
            func = func_match.group(1)
            args = self._split_args(func_match.group(2))
            self._call_function(func, args, delay_ms, assign_to=None)

    def _call_function(
        self, func: str, args: List[str], delay_ms: int, assign_to: Optional[str]
    ) -> None:
        """Executa função (PlayGlobalSound, PlayCombatSound, StopSound)."""
        if func in ("PlayGlobalSound", "PlayCombatSound"):
            channel = "global" if func == "PlayGlobalSound" else "combat"
            path = self._eval_value(args[0]) if args else None

            # ⚠️ VALIDAÇÃO: Descartar paths inválidos (single-letter, muito curtos, etc)
            if not self._is_valid_sound_path(path):
                logger.debug(
                    f"[PlaySound] ✗ Path inválido descartado: '{path}' (muito curto ou padrão inválido)"
                )
                return

            # ⚠️ VALIDAÇÃO DE PSEUDO-CANAIS: Descartar canais de sistema que não existem
            if not self._is_valid_channel_sound(path):
                logger.debug(f"[PlaySound] Pseudo-canal de sistema ignorado: '{path}'")
                return

            logger.debug(
                f"[PlaySound] Tentativa: func={func}, original_path='{path}', "
                f"channel={channel}, delay_ms={delay_ms}"
            )

            # Normaliza o caminho do arquivo (retorna a capitalização correta se encontrado)
            normalized_path = self._get_normalized_sound_path(path)

            if normalized_path is None:
                logger.warning(f"[PlaySound] ✗ Arquivo não encontrado: '{path}'")

                # Sugerir arquivos similares
                import app.interpreter as _interp_pkg
                registry = _interp_pkg.get_registry()
                similar = registry.find_similar(path, max_results=3)
                if similar:
                    logger.warning("[PlaySound] Arquivos similares disponíveis:")
                    for sim in similar:
                        logger.warning(f"[PlaySound]   - {sim}")

                # 🎵 FALLBACK: Tocar som padrão se disponível
                fallback = self._get_fallback_sound(channel, path)
                if fallback:
                    logger.debug(f"[PlaySound] 🔄 Usando fallback: {fallback}")
                    self._emit_sound_event(fallback, channel, None, delay_ms, "fallback")
                else:
                    # Sem fallback disponível: não emitir evento com path=None
                    logger.debug(f"[PlaySound] Arquivo '{path}' não encontrado e sem fallback — evento descartado")
                return

            pan = int(self._eval_value(args[1])) if len(args) > 1 else None

            logger.debug(
                f"[PlaySound] ✓ Som criado: path='{normalized_path}', pan={pan}, delay_ms={delay_ms}"
            )

            self._emit_sound_event(normalized_path, channel, pan, delay_ms, source="normal")
            return

        if func == "StopSound":
            target = self._eval_value(args[0]) if args else None
            logger.info(f"[StopSound] target='{target}', delay_ms={delay_ms}")

            event = {
                "action": "stop",
                "target": target,
                "delay_ms": delay_ms,
            }
            self._events.append(event)
            return
