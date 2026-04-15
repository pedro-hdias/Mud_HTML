"""
API de diagnóstico e validação do sistema de áudio.
"""
from fastapi import APIRouter
from fastapi.responses import RedirectResponse
from ..logger import get_logger

logger = get_logger("api.audio")
router = APIRouter()


@router.get("/audio")
def audio_page():
    """Página de teste do engine de áudio."""
    return RedirectResponse(url="/mud/", status_code=307)


@router.get("/api/audio/diagnostic")
async def audio_diagnostic():
    """Retorna diagnóstico completo do sistema de áudio com métricas de performance."""
    from ..sounds.engine import PrometheusSoundEngine
    from ..sounds.registry import get_registry

    try:
        engine = PrometheusSoundEngine()
        registry = get_registry()

        perf_stats = engine.get_performance_stats()

        return {
            "status": "OK",
            "engine": {
                "total_rules": len(engine._rules),
                "cached_matchers": perf_stats["cached_matchers"],
                "cache_coverage": perf_stats["cache_coverage"],
            },
            "registry": {
                **registry.get_stats(),
            },
            "performance": {
                "matcher_cache_coverage": perf_stats["cache_coverage"],
                "last_line": perf_stats["last_line_processed"],
            },
            "diagnostic_report": engine.get_diagnostic_report(),
        }
    except Exception as e:
        logger.exception(f"Erro no diagnóstico de áudio: {e}")
        return {
            "status": "ERROR",
            "error": "Erro interno ao gerar diagnóstico de áudio.",
        }


@router.get("/api/audio/performance-metrics")
async def audio_performance_metrics():
    """Retorna métricas detalhadas de performance do motor de áudio."""
    from ..sounds.engine import PrometheusSoundEngine

    try:
        engine = PrometheusSoundEngine()
        stats = engine.get_performance_stats()

        return {
            "status": "OK",
            "metrics": stats,
            "cache_efficiency": {
                "compiled": stats["cached_matchers"],
                "total_rules": stats["total_rules"],
                "coverage_percentage": stats["cache_coverage"],
                "benefit": "Matchers compilados em cache evitam recompilação em cada linha processada"
            },
            "timestamp": stats["timestamp"],
        }
    except Exception as e:
        logger.exception(f"Erro ao carregar métricas: {e}")
        return {
            "status": "ERROR",
            "error": "Erro interno ao carregar métricas de áudio.",
        }


@router.get("/api/sounds/validate/{sound_path:path}")
async def validate_sound(sound_path: str):
    """Verifica se som existe e retorna caminho normalizado."""
    from ..sounds.registry import get_registry

    try:
        registry = get_registry()
        normalized = registry.get(sound_path)

        return {
            "requested": sound_path,
            "normalized": normalized,
            "valid": normalized is not None,
            "available_similar": registry.find_similar(sound_path, max_results=5) if not normalized else [],
        }
    except Exception as e:
        logger.exception(f"Erro ao validar som: {e}")
        return {
            "requested": sound_path,
            "valid": False,
            "error": "Erro interno ao validar arquivo de som.",
        }
