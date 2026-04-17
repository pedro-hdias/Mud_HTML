"""
Testes unitários para SoundRegistry.
Cobre seleção resiliente do diretório de sons.
"""

from pathlib import Path
from unittest.mock import patch

from app.sounds.registry import SoundRegistry


def _criar_som(base: Path, relativo: str) -> None:
    """Cria um arquivo .ogg fictício para teste."""
    destino = base / relativo
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(b"ogg")


def test_sound_registry_usa_fallback_quando_diretorio_configurado_esta_vazio(tmp_path: Path) -> None:
    """Se o diretório configurado estiver vazio, deve usar o próximo fallback com arquivos."""
    vazio = tmp_path / "vazio"
    vazio.mkdir(parents=True)

    fallback = tmp_path / "fallback"
    _criar_som(fallback, "General/Misc/Teste.ogg")

    with patch("app.sounds.registry.SOUND_REGISTRY_DIR", str(vazio)), \
         patch.object(SoundRegistry, "_get_fallback_dirs", return_value=[fallback]):
        registry = SoundRegistry()

    assert registry.sounds_dir == fallback
    assert registry.exists("General/Misc/Teste.ogg") is True
    assert registry.get_stats()["total_files"] == 1


def test_sound_registry_mantem_diretorio_preferido_quando_ele_tem_arquivos(tmp_path: Path) -> None:
    """Se o diretório preferido já tiver sons, ele deve ser preservado."""
    preferido = tmp_path / "preferido"
    _criar_som(preferido, "Combat/Attack.ogg")

    fallback = tmp_path / "fallback"
    _criar_som(fallback, "General/Misc/Outro.ogg")

    with patch.object(SoundRegistry, "_get_fallback_dirs", return_value=[fallback]):
        registry = SoundRegistry(sounds_dir=preferido)

    assert registry.sounds_dir == preferido
    assert registry.exists("Combat/Attack.ogg") is True
    assert registry.get_stats()["total_files"] == 1
