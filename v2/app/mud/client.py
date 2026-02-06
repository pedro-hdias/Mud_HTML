import socket
from ..config import MUD_HOST, MUD_PORT
from ..logger import get_logger

mud_socket = None
logger = get_logger("mud.client")

def connect_to_mud():
    global mud_socket
    try:
        logger.debug(f"Opening TCP socket to {MUD_HOST}:{MUD_PORT}")
        mud_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        mud_socket.connect((MUD_HOST, MUD_PORT))
        mud_socket.setblocking(False)
        logger.debug("TCP socket connected")
        return True
    except Exception as e:
        logger.exception(f"TCP socket connection failed: {e}")
        mud_socket = None
        return False

def close_socket():
    global mud_socket
    if mud_socket:
        try:
            logger.debug("Closing TCP socket")
            mud_socket.close()
            logger.debug("TCP socket closed")
        except:
            logger.exception("TCP socket close failed")
        mud_socket = None

def send_to_mud(data):
    if mud_socket:
        try:
            logger.debug(f"Sending {len(data)} bytes to MUD")
            mud_socket.sendall(data)
        except Exception as e:
            logger.exception(f"Socket send failed: {e}")
            raise

def receive_from_mud(buffer_size=4096):
    if mud_socket:
        try:
            data = mud_socket.recv(buffer_size)
            logger.debug(f"Received {len(data)} bytes from MUD")
            return data
        except Exception as e:
            logger.exception(f"Socket receive failed: {e}")
            raise
    return None
