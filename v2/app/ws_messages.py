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


def parse_message(raw: str) -> Optional[Dict[str, Any]]:
    try:
        data = json.loads(raw)
    except Exception:
        return None

    message_type = data.get("type")
    payload = data.get("payload")
    meta = data.get("meta") or {}

    if payload is None:
        payload = {}
        for key in ("publicId", "owner", "value", "content", "message", "username", "password", "reason"):
            if key in data:
                payload[key] = data.get(key)

    return {
        "type": message_type,
        "payload": payload,
        "meta": meta
    }
