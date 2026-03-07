"""
Avaliação de expressões e condições Lua para o interpretador send.
"""
import re
from typing import Any, List

from ..lua import to_number, lua_match
from ...logger import get_logger
from .resolver import resolve_vars, strip_quotes

logger = get_logger(__name__)


def split_args(args_str: str) -> List[str]:
    """Separa argumentos de função respeitando aspas e parênteses aninhados."""
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


def split_concat(expr: str) -> List[str]:
    """Separa partes de concatenação (..) respeitando aspas e parênteses."""
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


def eval_condition(cond: str, captures: list, variables: dict, settings, rng) -> bool:
    """Avalia condição Lua, retornando True ou False."""
    expr = resolve_vars(cond, captures)
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
        "rand": rng.randint,
        "settings": settings,
    }

    try:
        result = bool(eval(expr, {"__builtins__": {}}, safe_env))
        return result
    except Exception as e:
        logger.warning(f"Erro ao avaliar condição '{cond[:40]}...': {e}")
        return False


def eval_value(expr: str, captures: list, variables: dict, settings, rng) -> Any:
    """Avalia expressão Lua, retornando o valor resultante."""
    expr = resolve_vars(expr.strip(), captures)

    if ".." in expr:
        parts = split_concat(expr)
        result = "".join(
            str(eval_value(part, captures, variables, settings, rng)) for part in parts
        )
        return result

    if expr.startswith('"') and expr.endswith('"'):
        return strip_quotes(expr)
    if expr.startswith("'") and expr.endswith("'"):
        return strip_quotes(expr)

    if re.match(r"^-?\d+$", expr):
        return int(expr)
    if re.match(r"^-?\d+\.\d+$", expr):
        return float(expr)

    func_match = re.match(r"([\w.]+)\((.*)\)", expr)
    if func_match:
        func = func_match.group(1)
        args = split_args(func_match.group(2))

        if func in ("math.random", "random", "rand"):
            if len(args) == 1:
                return rng.randint(1, int(eval_value(args[0], captures, variables, settings, rng)))
            if len(args) >= 2:
                return rng.randint(
                    int(eval_value(args[0], captures, variables, settings, rng)),
                    int(eval_value(args[1], captures, variables, settings, rng)),
                )

        if func in ("string.lower", "str_lower"):
            return str(eval_value(args[0], captures, variables, settings, rng)).lower()
        if func in ("string.len", "str_len"):
            return len(str(eval_value(args[0], captures, variables, settings, rng)))
        if func in ("tonumber", "to_number"):
            return to_number(eval_value(args[0], captures, variables, settings, rng))
        if func in ("string.match", "lua_match"):
            return lua_match(
                str(eval_value(args[0], captures, variables, settings, rng)),
                str(eval_value(args[1], captures, variables, settings, rng)),
            )

    if expr in variables:
        return variables[expr]
    if expr.startswith("settings."):
        attr = expr.split(".", 1)[1]
        return getattr(settings, attr, None)

    return expr
