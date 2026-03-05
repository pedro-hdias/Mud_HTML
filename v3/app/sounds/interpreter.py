"""
Interpretador de blocos 'send' do Prometheus.xml (subset Lua).
"""

import os
import re
import random
from pathlib import Path
from typing import Dict, List, Any, Optional

from .models import SoundEvent
from .registry import get_registry
from .state import _Settings, _ConfigTable
from .lua import to_number, lua_match
from ..logger import get_logger

logger = get_logger(__name__)

# Pseudo-canais de sistema que não possuem arquivos de som de canal
# Estes são usados pelo jogo para mensagens informativas, não comunicação real
SYSTEM_PSEUDO_CHANNELS = {
    "info",
    "system",
    "game",
    "server",
    "admin",
}


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
        self._rewritten_text: Optional[str] = None  # Texto reexibido via Note()

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
        
        Exemplo: Note("%0") reexibe o text original
                 Note("[Camera] %1") reexibe com prefixo
        """
        # Resolve variáveis no texto antes de armazenar
        resolved_text = self._resolve_vars(text)
        self._rewritten_text = resolved_text
        logger.debug(f"[Note] Texto reescrito: '{resolved_text}'")


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

        if line.startswith("Note("):
            self._handle_note(line)
            return
        
        if line.startswith("Execute("):
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

    def _handle_note(self, line: str) -> None:
        """Executa Note() para reexibir texto. Ex: Note("%0")"""
        inner = line[len("Note("):-1].strip()
        if not inner:
            return
        
        # Remove aspas se presente
        text = self._strip_quotes(inner)
        self.Note(text)

    def _call_function(self, func: str, args: List[str], delay_ms: int, assign_to: Optional[str]) -> None:
        """Executa função (PlayGlobalSound, PlayCombatSound, StopSound)."""
        if func in ("PlayGlobalSound", "PlayCombatSound"):
            channel = "global" if func == "PlayGlobalSound" else "combat"
            path = self._eval_value(args[0]) if args else None
            
            # ⚠️ VALIDAÇÃO MELHORADA: Descartar paths inválidos (single-letter, muito curtos, etc)
            if not self._is_valid_sound_path(path):
                logger.debug(f"[PlaySound] ✗ Path inválido descartado: '{path}' (muito curto ou padrão inválido)")
                return
            
            # ⚠️ VALIDAÇÃO DE PSEUDO-CANAIS: Descartar canais de sistema que não existem
            if not self._is_valid_channel_sound(path):
                logger.info(f"[PlaySound] Pseudo-canal de sistema ignorado: '{path}'")
                return
            
            # Log: Tentativa de tocar som
            logger.info(f"[PlaySound] Tentativa: func={func}, original_path='{path}', channel={channel}, delay_ms={delay_ms}")
            
            # Normaliza o caminho do arquivo (retorna a capitalização correta se encontrado)
            normalized_path = self._get_normalized_sound_path(path)
            
            if normalized_path is None:
                # Log detalhado de falha
                logger.warning(f"[PlaySound] ✗ Arquivo não encontrado: '{path}'")
                
                # Sugerir arquivos similares
                registry = get_registry()
                similar = registry.find_similar(path, max_results=3)
                if similar:
                    logger.warning(f"[PlaySound] Arquivos similares disponíveis:")
                    for sim in similar:
                        logger.warning(f"[PlaySound]   - {sim}")
                
                # 🎵 FALLBACK: Tocar som padrão se disponível
                fallback = self._get_fallback_sound(channel)
                if fallback:
                    logger.info(f"[PlaySound] 🔄 Usando fallback: {fallback}")
                    self._emit_sound_event(fallback, channel, None, delay_ms, "fallback")
                    return
            
            pan = int(self._eval_value(args[1])) if len(args) > 1 else None
            
            # Log: Sucesso
            logger.info(f"[PlaySound] ✓ Som criado: path='{normalized_path}', pan={pan}, delay_ms={delay_ms}")
            
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
        """Valida se o arquivo de som existe no diretório de sons estáticos (case-insensitive).
        Retorna True se encontra o arquivo independentemente da capitalização."""
        if not path:
            return False

        registry = get_registry()
        return registry.exists(path)
    
    def _get_normalized_sound_path(self, path: Optional[str]) -> Optional[str]:
        """Retorna o caminho normalizado (com capitalização correta) do arquivo, ou None se não encontrar.
        Garante que 'Flight Control', 'flight control', 'FLIGHT CONTROL' etc. retornam o nome canônico."""
        if not path:
            return None

        registry = get_registry()

        # Primeiro tenta match exato case-insensitive
        normalized = registry.get(path)
        if normalized:
            return normalized

        # Depois tenta uma resolução inteligente baseada no catálogo carregado no startup
        best_match = registry.resolve_best(path)
        if best_match:
            logger.info(f"[PlaySound] ↪ Resolução inteligente: '{path}' -> '{best_match}'")
            return best_match

        return None
    
    def _find_file_case_insensitive(self, base_dir: Path, relative_path: str) -> Optional[Path]:
        """Busca arquivo de forma case-insensitive perguntando o caminho.
        Retorna o Path absolutamente se encontrado, ou None se não encontrar."""
        parts = Path(relative_path).parts
        current_dir = base_dir
        
        for part in parts:
            if not current_dir.is_dir():
                return None
            
            # Busca a próxima parte ignorando maiúsculas/minúsculas
            part_lower = part.lower()
            found = False
            
            try:
                for item in current_dir.iterdir():
                    if item.name.lower() == part_lower:
                        current_dir = item
                        found = True
                        break
            except (OSError, PermissionError):
                return None
            
            if not found:
                return None
        
        # Verifica se o caminho final é um arquivo
        if current_dir.is_file():
            return current_dir
        
        return None
    
    def _resolve_vars(self, text: str) -> str:
        """Substitui variáveis %0, %1, %2, ... por capturas de regex."""
        resolved = text
        for idx, value in enumerate(self._captures):
            # Usa repr() para escapar corretamente todos os caracteres especiais
            # Isso previne SyntaxWarnings com sequências de escape inválidas
            escaped_value = repr(value)
            # Remove as aspas externas adicionadas por repr()
            if escaped_value.startswith('"') and escaped_value.endswith('"'):
                escaped_value = escaped_value[1:-1]
            elif escaped_value.startswith("'") and escaped_value.endswith("'"):
                escaped_value = escaped_value[1:-1]
            
            resolved = resolved.replace(f"%{idx}", escaped_value)
        return resolved

    def _strip_quotes(self, value: str) -> str:
        """Remove aspas de string literal."""
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            return value[1:-1]
        return value
    # ========== NOVOS MÉTODOS: VALIDAÇÃO E FALLBACK ==========

    def _is_valid_sound_path(self, path: Optional[str]) -> bool:
        """
        Valida se o path segue padrão de arquivo de som válido.
        
        Descarta:
        - Paths None ou vazios
        - Single-letter paths (n.ogg, p.ogg, a.ogg, etc)
        - Paths sem extensão .ogg
        - Paths muito curtos (< 4 caracteres)
        - Paths com caracteres perigosos
        - Paths com traversal (.. ou ./)
        """
        if not path or not isinstance(path, str):
            return False
        
        path = path.strip()
        
        # Muito curto (single-letter commands)
        if len(path) < 4:
            return False
        
        # Deve ter extensão .ogg
        if not path.lower().endswith(".ogg"):
            return False
        
        # Deve ter pelo menos uma barra (diretório/arquivo.ogg)
        if "/" not in path and "\\" not in path:
            return False

        normalized_path = path.replace("\\", "/")

        # Evitar falsos positivos comuns: basename de 1 caractere (ex: General/Channels/n.ogg)
        # Isso acontece em linhas de menu [n]/[p]/[a]/... capturadas por regras de canal.
        basename = normalized_path.rsplit("/", 1)[-1]
        stem = basename[:-4] if basename.lower().endswith(".ogg") else basename
        if len(stem) <= 1:
            return False
        
        # Path traversal detection: .. ou ./
        if ".." in path or normalized_path.startswith("./"):
            return False
        
        # Caracteres seguros (incluir espaço e hífen)
        safe_chars = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/_\\.- ")
        if not all(c in safe_chars for c in path):
            return False
        
        return True
    
    def _is_valid_channel_sound(self, path: Optional[str]) -> bool:
        """
        Verifica se um caminho de som de canal é válido.
        Retorna False para pseudo-canais de sistema que não existem.
        
        Exemplo:
            General/Channels/INFO.ogg -> False (INFO é pseudo-canal)
            General/Channels/OOC.ogg -> True (OOC é canal real)
        """
        if not path:
            return True
        
        # Detecta padrão General/Channels/*
        normalized_path = path.replace("\\", "/")
        if "General/Channels/" in normalized_path or "general/channels/" in normalized_path.lower():
            # Extrai nome do canal do caminho
            channel_name = Path(normalized_path).stem.lower()  # "INFO.ogg" -> "info"
            
            # Verifica se é pseudo-canal
            if channel_name in SYSTEM_PSEUDO_CHANNELS:
                logger.debug(f"[PlaySound] Pseudo-canal de sistema detectado: '{channel_name}' - som ignorado")
                return False
        
        return True
    
    def _get_fallback_sound(self, channel: str) -> Optional[str]:
        """
        Retorna path de fallback sound baseado no canal.
        
        Returns:
            Path normalizado do fallback ou None
        """
        fallback_map = {
            "global": "General/Misc/Beep2.ogg",
            "combat": "General/Devices/ButtonPush.ogg",
        }
        
        fallback_path = fallback_map.get(channel)
        if fallback_path:
            return self._get_normalized_sound_path(fallback_path)
        
        return None
    
    def _emit_sound_event(self, path: str, channel: str, pan: Optional[int], 
                         delay_ms: int, source: str = "normal") -> None:
        """
        Emite evento de som para a fila.
        
        Args:
            path: Caminho normalizado do som
            channel: Canal (global, combat, etc)
            pan: Panning value
            delay_ms: Delay em ms
            source: Origem do evento (normal, fallback, etc)
        """
        sound_id = self._next_sound_id()
        
        event = {
            "action": "play",
            "channel": channel,
            "path": path,
            "delay_ms": delay_ms,
            "pan": pan,
            "volume": 100,
            "sound_id": sound_id,
            "target": None,
            "source": source,  # DEBUG: Rastrear origem
        }
        
        target_var = "CurrentGlobalSound" if channel == "global" else "CurrentCombatSound"
        self._variables[target_var] = sound_id
        self._events.append(event)
        
        logger.debug(f"[SoundEvent] Emitido: source={source}, path={path}, channel={channel}, sound_id={sound_id}")