import json
from typing import Any, Dict, Optional


def make_message(message_type: str, payload: Optional[Dict[str, Any]] = None, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    message: Dict[str, Any] = {
        "type": message_type,
        "payload": payload or {}
    }
    if meta:
        message["meta"] = meta
    return message


# Tipos de mensagem válidos que o servidor aceita
_VALID_CLIENT_MESSAGE_TYPES = frozenset({"init", "connect", "disconnect", "login", "command"})
# Tamanho máximo de uma mensagem bruta (bytes)
_MAX_RAW_MESSAGE_SIZE = 8192


def parse_message(raw: str) -> Optional[Dict[str, Any]]:
    # Proteção contra mensagens excessivamente grandes
    if len(raw) > _MAX_RAW_MESSAGE_SIZE:
        return None

    try:
        data = json.loads(raw)
    except Exception:
        return None

    # Validação de schema básica
    if not isinstance(data, dict):
        return None

    message_type = data.get("type")
    if not isinstance(message_type, str) or message_type not in _VALID_CLIENT_MESSAGE_TYPES:
        return None

    payload = data.get("payload")
    if payload is not None and not isinstance(payload, dict):
        return None

    meta = data.get("meta")
    if meta is not None and not isinstance(meta, dict):
        meta = {}

    if payload is None:
        payload = {}
        for key in ("publicId", "owner", "value", "content", "message", "username", "password", "reason"):
            if key in data:
                val = data[key]
                # Só aceita strings nos campos de payload
                if isinstance(val, str):
                    payload[key] = val

    return {
        "type": message_type,
        "payload": payload,
        "meta": meta or {}
    }
