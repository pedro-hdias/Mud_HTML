import logging
import os
import sys
import threading

_LOGGER_CONFIGURED = False


def _configure_root_logger():
    global _LOGGER_CONFIGURED
    if _LOGGER_CONFIGURED:
        return

    root_logger = logging.getLogger()
    if not root_logger.handlers:
        # Formato detalhado com tudo que acontece
        formatter = logging.Formatter(
            "[%(asctime)s] [%(levelname)-8s] [%(name)s:%(funcName)s:%(lineno)d] [Thread:%(thread)d] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

        # Use caminho absoluto baseado no diretório do arquivo
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        log_dir = os.path.join(base_dir, "logs")
        os.makedirs(log_dir, exist_ok=True)
        
        # APENAS arquivo de log - nenhum output no terminal
        file_handler = logging.FileHandler(
            os.path.join(log_dir, "app.log"), 
            encoding="utf-8",
            mode="a"  # append mode
        )
        file_handler.setFormatter(formatter)
        file_handler.setLevel(logging.DEBUG)
        
        root_logger.addHandler(file_handler)

    root_logger.setLevel(logging.DEBUG)
    _LOGGER_CONFIGURED = True


def get_logger(name):
    _configure_root_logger()
    return logging.getLogger(name)
