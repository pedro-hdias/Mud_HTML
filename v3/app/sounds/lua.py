# -*- coding: utf-8 -*-

"""
Utilitários Lua para padrões de string e conversões.
"""

import re
from typing import Any, Optional
from .state import _LuaNumber
from ..logger import get_logger

logger = get_logger(__name__)


def to_number(value: Any) -> Optional[_LuaNumber]:
    """Converte para número (Lua tonumber)."""
    try:
        result = _LuaNumber(float(value))
        return result
    except Exception as e:
        return None


def lua_match(text: str, pattern: str) -> bool:
    """Implementa string.match estilo Lua."""
    regex = lua_pattern_to_regex(pattern)
    result = re.search(regex, text) is not None
    return result


def lua_pattern_to_regex(pattern: str) -> str:
    """Converte padrão Lua para regex Python (minimal subset)."""
    out = ""
    i = 0
    while i < len(pattern):
        ch = pattern[i]
        if ch == "%" and i + 1 < len(pattern):
            nxt = pattern[i + 1]
            out += lua_class_to_regex(nxt)
            i += 2
            continue
        if ch in r".^$[]()+-?*":
            out += ch if ch in ".^$[]()?*+" else re.escape(ch)
            i += 1
            continue
        # Use raw escape to avoid Python interpreting backslashes
        escaped = re.escape(ch)
        out += escaped
        i += 1
    
    return out


def lua_class_to_regex(ch: str) -> str:
    """Converte classe de caractere Lua para regex Python."""
    punct = r"""[!"#$%&'()*+,\\/:;<=>?@[\\]^_`{|}~]"""
    mapping = {
        "a": "[A-Za-z]",
        "A": "[^A-Za-z]",
        "d": r"\d",
        "D": r"\D",
        "s": r"\s",
        "S": r"\S",
        "w": r"\w",
        "W": r"\W",
        "p": punct,
        "c": r"[\x00-\x1F]",
        "x": "[0-9A-Fa-f]",
        "u": "[A-Z]",
        "l": "[a-z]",
    }
    return mapping.get(ch, re.escape(ch))
