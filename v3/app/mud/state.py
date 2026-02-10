from enum import Enum
from ..logger import get_logger

logger = get_logger("mud.state")

class ConnectionState(Enum):
    DISCONNECTED = "DISCONNECTED"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    AWAITING_LOGIN = "AWAITING_LOGIN"


def log_state_change(previous_state: ConnectionState, new_state: ConnectionState, context: str = "") -> None:
    message = f"State change {previous_state.value} -> {new_state.value}"
    if context:
        message = f"{message} ({context})"
    logger.debug(message)


def log_state_read(state: ConnectionState, context: str = "") -> None:
    message = f"State read: {state.value}"
    if context:
        message = f"{message} ({context})"
    logger.debug(message)
