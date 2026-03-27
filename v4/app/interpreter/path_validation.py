"""
Validação de caminhos de som e resolução via registry.
"""
from pathlib import Path
from typing import Callable, Optional

from ..logger import get_logger


def _get_registry():
    """
    Wrapper interno para obtenção do registry com suporte a patching de testes.

    As funções deste módulo fazem lookup do registry em tempo de execução através
    do namespace do pacote `app.interpreter`, permitindo que testes usem
    `@patch("app.interpreter.get_registry", ...)` para injetar mocks.
    """
    import app.interpreter as _interp_pkg
    return _interp_pkg.get_registry()

logger = get_logger(__name__)

# Pseudo-canais de sistema que não possuem arquivos de som de canal.
# Estes são usados pelo jogo para mensagens informativas, não comunicação real.
SYSTEM_PSEUDO_CHANNELS = {
    "info",
    "system",
    "game",
    "server",
    "admin",
}


def is_valid_sound_path(path) -> bool:
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

    # Evitar falsos positivos comuns: basename de 1 caractere (ex: General/Channels/n.ogg).
    # Isso acontece em linhas de menu [n]/[p]/[a]/... capturadas por regras de canal.
    basename = normalized_path.rsplit("/", 1)[-1]
    stem = basename[:-4] if basename.lower().endswith(".ogg") else basename
    if len(stem) <= 1:
        return False

    # Path traversal detection: .. ou ./
    if ".." in path or normalized_path.startswith("./"):
        return False

    # Caracteres seguros (incluir espaço e hífen)
    safe_chars = set(
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/_\\.- "
    )
    if not all(c in safe_chars for c in path):
        return False

    return True


def is_valid_channel_sound(path) -> bool:
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
            logger.debug(
                f"[PlaySound] Pseudo-canal de sistema detectado: '{channel_name}' - som ignorado"
            )
            return False

    return True


def get_fallback_sound(channel: str, get_normalized_fn: Callable) -> Optional[str]:
    """
    Retorna path de fallback sound baseado no canal.

    Args:
        channel: Canal de áudio (global, combat, etc)
        get_normalized_fn: Função para normalizar o caminho do som

    Returns:
        Path normalizado do fallback ou None
    """
    fallback_map = {
        "global": "General/Misc/Beep2.ogg",
        "combat": "General/Devices/ButtonPush.ogg",
    }

    fallback_path = fallback_map.get(channel)
    if fallback_path:
        return get_normalized_fn(fallback_path)

    return None


def sound_file_exists(path: Optional[str]) -> bool:
    """Valida se o arquivo de som existe no registry (case-insensitive)."""
    if not path:
        return False

    registry = _get_registry()
    return registry.exists(path)


def get_normalized_sound_path(path: Optional[str]) -> Optional[str]:
    """
    Retorna o caminho normalizado (com capitalização correta) do arquivo,
    ou None se não encontrar.

    Garante que 'Flight Control', 'flight control', 'FLIGHT CONTROL' etc.
    retornam o nome canônico.
    """
    if not path:
        return None

    registry = _get_registry()
    normalized = registry.get(path)
    if normalized:
        return normalized

    # Depois tenta uma resolução inteligente baseada no catálogo carregado no startup
    best_match = registry.resolve_best(path)
    if best_match:
        logger.info(f"[PlaySound] ↪ Resolução inteligente: '{path}' -> '{best_match}'")
        return best_match

    return None


def find_file_case_insensitive(base_dir: Path, relative_path: str) -> Optional[Path]:
    """
    Busca arquivo de forma case-insensitive percorrendo o caminho a partir de base_dir.

    Retorna o Path completo relativo a base_dir se o arquivo for encontrado,
    ou None se algum componente do caminho não existir. O Path retornado terá
    a mesma natureza (absoluto ou relativo) que base_dir.
    """
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
