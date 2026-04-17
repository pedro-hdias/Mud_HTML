"""
SoundRegistry - Catalogo de sons disponíveis no disco.
Fornece normalização rápida e diagnóstico de arquivos de som.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional
from ..config import AUDIO_DEBUG_DETAILS, SOUND_REGISTRY_DIR
from ..logger import get_logger

logger = get_logger(__name__)

# Pseudo-canais de sistema que não possuem arquivos de som de canal
SYSTEM_PSEUDO_CHANNELS = {
    "info",
    "system",
    "game",
    "server",
    "admin",
}


class SoundRegistry:
    """
    Cataloga todos os sons disponíveis no disco.
    Permite normalização rápida de caminhos (case-insensitive lookup).
    """

    def __init__(self, sounds_dir: Optional[Path] = None):
        """
        Inicializa registry.

        Args:
            sounds_dir: Diretório de sons (padrão: static/sounds relativo à raiz do projeto)
        """
        self.sounds_dir = self._resolve_sounds_dir(sounds_dir)
        self._catalog: Dict[str, Path] = {}  # {normalized_lower: Path_real}
        self._categories: Dict[str, List[str]] = {}  # {category: [files]}
        self._inventory_tree: Dict[str, Any] = {}

        self._refresh()

    @staticmethod
    def _has_sound_files(directory: Path) -> bool:
        """Retorna True quando o diretório contém ao menos um .ogg."""
        if not directory.exists() or not directory.is_dir():
            return False

        return any(directory.rglob("*.ogg"))

    def _get_fallback_dirs(self) -> List[Path]:
        """Lista caminhos candidatos conhecidos para o catálogo de sons."""
        project_root = Path(__file__).resolve().parents[3]
        backend_root = Path(__file__).resolve().parents[2]

        return [
            backend_root / "static" / "sounds",
            project_root / "frontend" / "static" / "sounds",
            Path("/app/sounds"),
        ]

    def _resolve_sounds_dir(self, sounds_dir: Optional[Path]) -> Path:
        """Escolhe o melhor diretório disponível para o inventário de sons."""
        configured_dir = Path(sounds_dir) if sounds_dir is not None else None
        if configured_dir is None and SOUND_REGISTRY_DIR:
            configured_dir = Path(SOUND_REGISTRY_DIR)

        candidates: List[Path] = []
        if configured_dir is not None:
            candidates.append(configured_dir)
        candidates.extend(self._get_fallback_dirs())

        seen: set[str] = set()
        first_existing: Optional[Path] = None

        for candidate in candidates:
            normalized_candidate = Path(candidate)
            candidate_key = str(normalized_candidate)
            if candidate_key in seen:
                continue
            seen.add(candidate_key)

            if not normalized_candidate.exists():
                continue

            if first_existing is None:
                first_existing = normalized_candidate

            if self._has_sound_files(normalized_candidate):
                if configured_dir is not None and normalized_candidate != configured_dir:
                    logger.warning(
                        "Diretório configurado de sons está vazio ou inválido (%s). Usando fallback: %s",
                        configured_dir,
                        normalized_candidate,
                    )
                return normalized_candidate

        if first_existing is not None:
            return first_existing

        return configured_dir if configured_dir is not None else self._get_fallback_dirs()[0]
    
    def _refresh(self):
        """Indexa todos os arquivos .ogg recursivamente."""
        self._catalog.clear()
        self._categories.clear()
        self._inventory_tree.clear()
        
        if not self.sounds_dir.exists():
            logger.warning(f"Diretório de sons não encontrado: {self.sounds_dir}")
            return

        if not self._has_sound_files(self.sounds_dir):
            logger.warning(f"Diretório de sons está acessível, mas vazio: {self.sounds_dir}")
            return
        
        count = 0
        for file_path in self.sounds_dir.rglob("*.ogg"):
            relative = file_path.relative_to(self.sounds_dir)
            normalized = str(relative).lower().replace("\\", "/")
            
            # Armazenar com caminho real para recuperar capitalização
            self._catalog[normalized] = file_path
            
            # Categorizar por diretório principal
            parts = relative.parts
            if len(parts) > 0:
                category = parts[0]
                if category not in self._categories:
                    self._categories[category] = []
                self._categories[category].append(str(relative).replace("\\", "/"))

            self._add_to_inventory(relative)
            
            count += 1
        
        logger.info(f"Registry atualizado: {count} arquivos de som catalogados")
        if AUDIO_DEBUG_DETAILS:
            category_counts = {category: len(files) for category, files in self._categories.items()}
            logger.info(f"Registry (debug): arquivos por categoria: {category_counts}")

    def _add_to_inventory(self, relative: Path) -> None:
        """Adiciona arquivo ao inventário hierárquico em memória."""
        parts = list(relative.parts)
        if not parts:
            return

        filename = parts[-1]
        dir_parts = [part.lower() for part in parts[:-1]]

        node: Dict[str, Any] = self._inventory_tree
        for directory in dir_parts:
            node = node.setdefault(directory, {})

        files = node.setdefault("_files", [])
        if filename not in files:
            files.append(filename)
    
    def get(self, path: str) -> Optional[str]:
        """
        Busca arquivo normalizado.
        
        Args:
            path: Caminho solicitado (ex: "General/Misc/Outdated.ogg")
        
        Returns:
            Caminho normalizado com capitalização correta, ou None se não encontrar
        """
        normalized = path.lower().replace("\\", "/")
        if normalized in self._catalog:
            real_path = self._catalog[normalized]
            return str(real_path.relative_to(self.sounds_dir)).replace("\\", "/")
        return None

    def resolve_best(self, path: str, min_score: int = 120) -> Optional[str]:
        """
        Resolve caminho inexistente para o melhor candidato possível no catálogo.

        Útil para casos como General/Channels/INFO.ogg -> General/Misc/ViewInfo.ogg.
        """
        direct = self.get(path)
        if direct:
            return direct
        
        # Detecta pseudo-canais de sistema e não tenta resolver
        normalized_path = path.replace("\\", "/")
        if "General/Channels/" in normalized_path or "general/channels/" in normalized_path.lower():
            channel_name = Path(normalized_path).stem.lower()
            if channel_name in SYSTEM_PSEUDO_CHANNELS:
                logger.debug(f"[Registry] Pseudo-canal detectado: '{channel_name}' - sem fallback")
                return None

        normalized_request = path.lower().replace("\\", "/")
        request_parts = normalized_request.split("/")
        request_top = request_parts[0] if request_parts else ""
        request_second = request_parts[1] if len(request_parts) > 1 else ""
        request_basename = request_parts[-1] if request_parts else ""
        request_stem = request_basename[:-4] if request_basename.endswith(".ogg") else request_basename
        request_stem_key = "".join(ch for ch in request_stem if ch.isalnum())

        if len(request_stem_key) < 3:
            return None

        best_score = -1
        best_match: Optional[str] = None

        for normalized_candidate, real_path in self._catalog.items():
            candidate_parts = normalized_candidate.split("/")
            candidate_top = candidate_parts[0] if candidate_parts else ""
            candidate_second = candidate_parts[1] if len(candidate_parts) > 1 else ""
            candidate_basename = candidate_parts[-1] if candidate_parts else ""
            candidate_stem = candidate_basename[:-4] if candidate_basename.endswith(".ogg") else candidate_basename
            candidate_stem_key = "".join(ch for ch in candidate_stem if ch.isalnum())

            if not candidate_stem_key:
                continue

            name_similarity = 0
            if request_stem_key == candidate_stem_key:
                name_similarity = 80
            elif request_stem_key in candidate_stem_key or candidate_stem_key in request_stem_key:
                name_similarity = 35

            # Não aceita candidatos sem similaridade de nome-base
            if name_similarity == 0:
                continue

            score = 0
            if request_top and request_top == candidate_top:
                score += 100
            if request_second and request_second == candidate_second:
                score += 40
            score += name_similarity

            if score > best_score:
                best_score = score
                best_match = str(real_path.relative_to(self.sounds_dir)).replace("\\", "/")

        if best_score >= min_score:
            return best_match
        return None
    
    def exists(self, path: str) -> bool:
        """Verifica se arquivo existe."""
        return self.get(path) is not None
    
    def find_similar(self, path: str, max_results: int = 5) -> List[str]:
        """
        Encontra caminhos similares (para sugestões de erro).
        
        Args:
            path: Caminho solicitado
            max_results: Número máximo de resultados
        
        Returns:
            Lista de caminhos similares
        """
        parts = path.lower().replace("\\", "/").split("/")
        
        # Buscar por último componente
        basename = parts[-1] if parts else ""
        
        similar = []
        for cataloged in self._catalog.keys():
            if basename and basename in cataloged:
                real_path = self._catalog[cataloged]
                similar.append(str(real_path.relative_to(self.sounds_dir)).replace("\\", "/"))
        
        return similar[:max_results]
    
    def list_category(self, category: str) -> List[str]:
        """
        Lista todos os sons em uma categoria.
        
        Args:
            category: Nome da categoria (ex: "General")
        
        Returns:
            Lista de caminhos de sons
        """
        normalized_category = category.lower()
        
        # Buscar categoria com case-insensitive
        for cat in self._categories.keys():
            if cat.lower() == normalized_category:
                return sorted(self._categories[cat])
        
        return []
    
    def get_categories(self) -> Dict[str, int]:
        """Retorna contagem de sons por categoria."""
        return {cat: len(files) for cat, files in self._categories.items()}
    
    def get_stats(self) -> dict:
        """Retorna estatísticas do registry."""
        total_files = len(self._catalog)
        categories = self.get_categories()
        
        return {
            "total_files": total_files,
            "total_categories": len(categories),
            "categories": categories,
            "sounds_dir": str(self.sounds_dir),
        }

    def get_inventory_tree(self) -> Dict[str, Any]:
        """Retorna inventário hierárquico dos sons carregados no startup."""
        return self._inventory_tree
    
    def diagnostic_report(self) -> str:
        """Retorna relatório de diagnóstico."""
        stats = self.get_stats()
        
        lines = [
            "=" * 60,
            "SOUND REGISTRY DIAGNOSTIC",
            "=" * 60,
            f"Diretório: {stats['sounds_dir']}",
            f"Status: {'✓ Ativo' if stats['total_files'] > 0 else '✗ Vazio'}",
            f"Total de arquivos: {stats['total_files']}",
            f"Total de categorias: {stats['total_categories']}",
            "",
            "Categorias:",
        ]
        
        categories = stats['categories']
        for cat in sorted(categories.keys()):
            count = categories[cat]
            lines.append(f"  • {cat}: {count} sons")
        
        lines.extend([
            "",
            "=" * 60,
        ])
        
        return "\n".join(lines)


# Singleton global
_registry_instance: Optional[SoundRegistry] = None


def get_registry(force_refresh: bool = False) -> SoundRegistry:
    """
    Obtém instância singleton do registry.
    
    Args:
        force_refresh: Se True, cria nova instância (útil para testes)
    
    Returns:
        Instância do SoundRegistry
    """
    global _registry_instance
    
    if force_refresh or _registry_instance is None:
        _registry_instance = SoundRegistry()
    
    return _registry_instance
