"""
Pacote interpretador de blocos 'send' do Prometheus.xml.
Exporta SendInterpreter e SYSTEM_PSEUDO_CHANNELS para compatibilidade com o código existente.
"""
# get_registry é re-exportado aqui para que testes possam fazer
# @patch("app.sounds.interpreter.get_registry", ...) e o mock seja respeitado
# pelos submodulos que fazem lookup lazy via este namespace.
from ..registry import get_registry  # noqa: F401
from .facade import SendInterpreter
from .path_validation import SYSTEM_PSEUDO_CHANNELS

__all__ = ["SendInterpreter", "SYSTEM_PSEUDO_CHANNELS"]
