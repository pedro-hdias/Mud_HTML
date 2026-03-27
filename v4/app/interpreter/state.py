"""
Estado compartilhado entre interpretador de Lua e engine de sons.
"""

from typing import Any, Dict, Optional


class _LuaNumber:
    """Wrapper para números Lua (todos são verdadeiros em Lua, diferente de Python)."""
    
    def __init__(self, value: float):
        self.value = value

    def __bool__(self) -> bool:
        return True

    def __int__(self) -> int:
        return int(self.value)

    def __float__(self) -> float:
        return float(self.value)

    def __str__(self) -> str:
        return str(self.value)

    def _coerce(self, other: Any) -> float:
        if isinstance(other, _LuaNumber):
            return other.value
        return float(other)

    def __eq__(self, other: Any) -> bool:
        return self.value == self._coerce(other)

    def __lt__(self, other: Any) -> bool:
        return self.value < self._coerce(other)

    def __le__(self, other: Any) -> bool:
        return self.value <= self._coerce(other)

    def __gt__(self, other: Any) -> bool:
        return self.value > self._coerce(other)

    def __ge__(self, other: Any) -> bool:
        return self.value >= self._coerce(other)

    def __add__(self, other: Any) -> "_LuaNumber":
        return _LuaNumber(self.value + self._coerce(other))

    def __sub__(self, other: Any) -> "_LuaNumber":
        return _LuaNumber(self.value - self._coerce(other))

    def __mul__(self, other: Any) -> "_LuaNumber":
        return _LuaNumber(self.value * self._coerce(other))

    def __truediv__(self, other: Any) -> "_LuaNumber":
        return _LuaNumber(self.value / self._coerce(other))


class _Settings:
    """Dicionário de settings configuráveis do Prometheus."""
    
    def __init__(self, initial: Optional[Dict[str, int]] = None):
        self._data = dict(initial or {})

    def __getattr__(self, name: str) -> _LuaNumber:
        return _LuaNumber(int(self._data.get(name, 1)))

    def __setattr__(self, name: str, value: int) -> None:
        if name == "_data":
            super().__setattr__(name, value)
        else:
            self._data[name] = int(value)


class _ConfigTable:
    """Tabela de configuração que encapsula Settings (mimics Lua ConfigTable.Settings)."""
    
    def __init__(self, settings: _Settings):
        self.Settings = settings
