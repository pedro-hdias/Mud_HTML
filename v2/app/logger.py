import json
import logging
import os

from datetime import datetime, timezone

_LOGGER_CONFIGURED = False
_LOG_FILE_PATH = None


class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "function": record.funcName,
            "line": record.lineno,
            "thread": record.thread,
            "message": record.getMessage(),
        }

        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        if record.stack_info:
            log_entry["stack"] = record.stack_info

        return json.dumps(log_entry, ensure_ascii=False)


def _configure_root_logger():
    global _LOGGER_CONFIGURED
    global _LOG_FILE_PATH
    if _LOGGER_CONFIGURED:
        return

    root_logger = logging.getLogger()
    if not root_logger.handlers:
        # Formato detalhado com tudo que acontece
        formatter = JsonFormatter()

        # Use caminho absoluto baseado no diretório do arquivo
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        log_dir = os.path.join(base_dir, "logs")
        os.makedirs(log_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y_%m_%d_%H_%M_%S")
        log_filename = f"log_{timestamp}.log"
        _LOG_FILE_PATH = os.path.join(log_dir, log_filename)

        # APENAS arquivo de log - nenhum output no terminal
        file_handler = logging.FileHandler(
            _LOG_FILE_PATH,
            encoding="utf-8",
            mode="a"  # append mode
        )
        file_handler.setFormatter(formatter)
        file_handler.setLevel(logging.DEBUG)
        
        root_logger.addHandler(file_handler)

    root_logger.setLevel(logging.DEBUG)
    _LOGGER_CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    _configure_root_logger()
    return logging.getLogger(name)


def get_current_log_file_path() -> str:
    _configure_root_logger()
    return _LOG_FILE_PATH
