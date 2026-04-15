"""
Pacote interpretador de blocos 'send' do Prometheus.xml.
Exporta SendInterpreter e SYSTEM_PSEUDO_CHANNELS para compatibilidade com o código existente.
"""
from .facade import SendInterpreter
from .path_validation import SYSTEM_PSEUDO_CHANNELS


def get_registry():
    """
    Importação lazy do registry de sons.

    Exposta neste namespace para que testes possam fazer
    @patch("app.interpreter.get_registry", ...) sem circular import,
    já que sounds.registry só é carregado na primeira chamada.
    """
    from ..sounds.registry import get_registry as _get_registry
    return _get_registry()


__all__ = ["SendInterpreter", "SYSTEM_PSEUDO_CHANNELS", "get_registry"]
