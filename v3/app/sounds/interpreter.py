"""
Interpretador de blocos 'send' do Prometheus.xml (subset Lua).
"""

import os
import re
import random
from pathlib import Path
from typing import Dict, List, Any, Optional

from .models import SoundEvent
from .state import _Settings, _ConfigTable
from .lua import to_number, lua_match
from ..logger import get_logger

logger = get_logger(__name__)


class SendInterpreter:
    """Executa blocos 'send' em contexto de captura de regex."""
    
    def __init__(
        self,
        captures: List[str],
        variables: Dict[str, Any],
        settings: _Settings,
        config_table: _ConfigTable,
        rng: random.Random,
    ):
        self._captures = captures
        self._variables = variables
        self._settings = settings
        self._config_table = config_table
        self._rng = rng
        self._events: List[Dict[str, Any]] = []

    def run(self, send_text: str, delay_ms: int = 0) -> List[Dict[str, Any]]:
        """Executa send_text e retorna lista de eventos."""
        if not send_text:
            return []
        
        lines = self._prepare_lines(send_text)
        self._execute_lines(lines, delay_ms=delay_ms)
        
        return self._events

    def _prepare_lines(self, send_text: str) -> List[str]:
        """Prepara linhas para execução (remove comentários, tags, etc)."""
        lines: List[str] = []
        for raw in send_text.splitlines():
            line = raw.strip()
            if not line:
                continue
            if line.startswith("<send>") or line.startswith("</send>"):
                continue
            if line.startswith("--"):
                continue
            if "/*" in line or "*/" in line:
                continue
            lines.append(line)
        return lines

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
                stack.append({"type": "if", "parent": self._is_active(stack), "active": result, "executed": result})
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

    def _collect_block(self, lines: List[str], start_index: int) -> tuple:
        """Coleta linhas até 'end'."""
        depth = 0
        block: List[str] = []
        i = start_index
        while i < len(lines):
            line = lines[i]
            if (line.startswith("if ") and line.endswith(" then")) or (line.startswith("for ") and line.endswith(" do")):
                depth += 1
            elif line == "end":
                if depth == 0:
                    break
                depth -= 1
            block.append(line)
            i += 1
        return block, i

    def _is_active(self, stack: List[Dict[str, Any]]) -> bool:
        """Verifica se bloco está ativo."""
        return all(item.get("active", True) for item in stack)

    def _execute_statement(self, line: str, delay_ms: int) -> None:
        """Executa uma declaração (atribuição ou função)."""
        line = self._resolve_vars(line)

        if line.startswith("Execute(") or line.startswith("Note("):
            return

        if line.startswith("DoAfterSpecial("):
            self._handle_do_after_special(line)
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

    def _handle_do_after_special(self, line: str) -> None:
        """Executa DoAfterSpecial (delay)."""
        inner = line[len("DoAfterSpecial("):-1]
        args = self._split_args(inner)
        if len(args) < 2:
            return
        delay_seconds = float(self._eval_value(args[0]) or 0)
        action_code = self._strip_quotes(args[1])
        delay_ms = int(delay_seconds * 1000)
        self._execute_lines([action_code], delay_ms=delay_ms)

    def _call_function(self, func: str, args: List[str], delay_ms: int, assign_to: Optional[str]) -> None:
        """Executa função (PlayGlobalSound, PlayCombatSound, StopSound)."""
        if func in ("PlayGlobalSound", "PlayCombatSound"):
            channel = "global" if func == "PlayGlobalSound" else "combat"
            path = self._eval_value(args[0]) if args else None
            
            # Valida se o arquivo de som existe
            if not self._sound_file_exists(path):
                logger.warning(f"Arquivo de som não encontrado: {path}")
                return
            
            pan = int(self._eval_value(args[1])) if len(args) > 1 else None
            sound_id = self._next_sound_id()
            
            logger.info(f"Som criado: channel={channel}, path='{path}', pan={pan}, sound_id={sound_id}, delay_ms={delay_ms}")
            
            event = {
                "action": "play",
                "channel": channel,
                "path": path,
                "delay_ms": delay_ms,
                "pan": pan,
                "volume": 100,
                "sound_id": sound_id,
                "target": None,
            }
            
            target_var = assign_to or ("CurrentGlobalSound" if channel == "global" else "CurrentCombatSound")
            self._variables[target_var] = sound_id
            self._events.append(event)
            return

        if func == "StopSound":
            target = self._eval_value(args[0]) if args else None
            logger.info(f"Stop sound: target='{target}', delay_ms={delay_ms}")
            
            event = {
                "action": "stop",
                "target": target,
                "delay_ms": delay_ms,
            }
            self._events.append(event)
            return

    def _next_sound_id(self) -> str:
        """Gera ID único para som."""
        self._variables.setdefault("_sound_id_counter", 0)
        self._variables["_sound_id_counter"] += 1
        return f"s{self._variables['_sound_id_counter']}"

    def _eval_condition(self, cond: str) -> bool:
        """Avalia condição Lua."""
        expr = self._resolve_vars(cond)
        expr = expr.strip()
        if expr.startswith("(") and expr.endswith(")"):
            expr = expr[1:-1].strip()
        
        expr = expr.replace("~=", "!=")
        expr = expr.replace("ConfigTable.Settings.", "settings.")
        expr = expr.replace("string.match", "lua_match")
        expr = expr.replace("string.lower", "str_lower")
        expr = expr.replace("string.len", "str_len")
        expr = expr.replace("tonumber", "to_number")
        expr = expr.replace("math.random", "rand")
        
        safe_env = {
            "lua_match": lua_match,
            "str_lower": lambda s: str(s).lower(),
            "str_len": lambda s: len(str(s)),
            "to_number": to_number,
            "rand": self._rng.randint,
            "settings": self._settings,
        }
        
        try:
            result = bool(eval(expr, {"__builtins__": {}}, safe_env))
            return result
        except Exception as e:
            logger.warning(f"Erro ao avaliar condição '{cond[:40]}...': {e}")
            return False

    def _eval_value(self, expr: str) -> Any:
        """Avalia expressão Lua."""
        expr = self._resolve_vars(expr.strip())
        
        if ".." in expr:
            parts = self._split_concat(expr)
            result = "".join(str(self._eval_value(part)) for part in parts)

            return result
        
        if expr.startswith('"') and expr.endswith('"'):
            return self._strip_quotes(expr)
        if expr.startswith("'") and expr.endswith("'"):
            return self._strip_quotes(expr)
        
        if re.match(r"^-?\d+$", expr):
            return int(expr)
        if re.match(r"^-?\d+\.\d+$", expr):
            return float(expr)

        func_match = re.match(r"([\w.]+)\((.*)\)", expr)
        if func_match:
            func = func_match.group(1)
            args = self._split_args(func_match.group(2))
            
            if func in ("math.random", "random", "rand"):
                if len(args) == 1:
                    result = self._rng.randint(1, int(self._eval_value(args[0])))
                    return result
                if len(args) >= 2:
                    result = self._rng.randint(int(self._eval_value(args[0])), int(self._eval_value(args[1])))
                    return result
            
            if func in ("string.lower", "str_lower"):
                return str(self._eval_value(args[0])).lower()
            if func in ("string.len", "str_len"):
                return len(str(self._eval_value(args[0])))
            if func in ("tonumber", "to_number"):
                return to_number(self._eval_value(args[0]))
            if func in ("string.match", "lua_match"):
                return lua_match(str(self._eval_value(args[0])), str(self._eval_value(args[1])))

        if expr in self._variables:
            value = self._variables[expr]
            return value
        if expr.startswith("settings."):
            attr = expr.split(".", 1)[1]
            value = getattr(self._settings, attr, None)
            return value
        
        return expr

    def _split_args(self, args_str: str) -> List[str]:
        """Separa argumentos de função."""
        args: List[str] = []
        buf = ""
        depth = 0
        in_quote = None
        
        for ch in args_str:
            if in_quote:
                buf += ch
                if ch == in_quote:
                    in_quote = None
                continue
            if ch in ('"', "'"):
                in_quote = ch
                buf += ch
                continue
            if ch == "(" or ch == "[":
                depth += 1
            elif ch == ")" or ch == "]":
                depth -= 1
            if ch == "," and depth == 0:
                args.append(buf.strip())
                buf = ""
                continue
            buf += ch
        
        if buf.strip():
            args.append(buf.strip())
        return args

    def _split_concat(self, expr: str) -> List[str]:
        """Separa partes de concatenação (..)."""
        parts: List[str] = []
        buf = ""
        depth = 0
        in_quote = None
        i = 0
        
        while i < len(expr):
            ch = expr[i]
            if in_quote:
                buf += ch
                if ch == in_quote:
                    in_quote = None
                i += 1
                continue
            if ch in ('"', "'"):
                in_quote = ch
                buf += ch
                i += 1
                continue
            if ch == "(" or ch == "[":
                depth += 1
            elif ch == ")" or ch == "]":
                depth -= 1
            if ch == "." and i + 1 < len(expr) and expr[i + 1] == "." and depth == 0:
                parts.append(buf.strip())
                buf = ""
                i += 2
                continue
            buf += ch
            i += 1
        
        if buf.strip():
            parts.append(buf.strip())
        return parts

    def _sound_file_exists(self, path: Optional[str]) -> bool:
        """Valida se o arquivo de som existe no diretório de sons estáticos."""
        if not path:
            return False
        
        # Constrói o caminho completo do arquivo de som
        # __file__ está em v3/app/sounds/interpreter.py, então sobe 3 níveis para v3, depois acessa static/sounds
        sounds_dir = Path(__file__).resolve().parents[2] / "static" / "sounds"
        sound_file = sounds_dir / path
        
        exists = sound_file.exists()

        return exists

    def _resolve_vars(self, text: str) -> str:
        """Substitui variáveis %0, %1, %2, ... por capturas de regex."""
        resolved = text
        for idx, value in enumerate(self._captures):
            # Escapa aspas duplas para evitar quebra de sintaxe Lua
            escaped_value = value.replace('\\', '\\\\').replace('"', '\\"')
            resolved = resolved.replace(f"%{idx}", escaped_value)
        return resolved

    def _strip_quotes(self, value: str) -> str:
        """Remove aspas de string literal."""
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            return value[1:-1]
        return value
