"""
Testes unitários para PrometheusSoundEngine.
Cobre: criação, processamento de linhas, status padrão.
"""

from unittest.mock import MagicMock, patch

from app.sounds.engine import PrometheusSoundEngine


# ──────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────

def _make_engine() -> PrometheusSoundEngine:
    """Cria motor com lista de regras vazia para testes isolados.
    Patcha load_rules e get_registry para evitar I/O real.
    """
    with patch("app.sounds.engine.load_rules", return_value=[]), \
         patch("app.sounds.engine.get_registry") as mock_reg:
        mock_reg.return_value = _mock_registry()
        engine = PrometheusSoundEngine(rules=None)
    return engine


def _mock_registry():
    """Cria mock simples do SoundRegistry."""
    reg = MagicMock()
    reg.get_stats.return_value = {
        "total_files": 0,
        "categories": {},
        "total_categories": 0,
    }
    return reg


# ──────────────────────────────────────────────
# Testes
# ──────────────────────────────────────────────

class TestEngineCriacao:
    """Testa criação e inicialização do motor."""

    def test_engine_criacao_com_regras_vazias(self):
        """Motor deve ser criado com sucesso quando lista de regras está vazia."""
        engine = _make_engine()
        assert engine is not None

    def test_engine_tem_lista_de_regras(self):
        """Motor criado com rules=[] deve ter lista de regras vazia."""
        engine = _make_engine()
        assert engine._rules == []


class TestEngineProcessamento:
    """Testa processamento de linhas pelo motor."""

    def test_linha_vazia_retorna_sem_eventos(self):
        """Linha vazia não deve gerar eventos."""
        engine = _make_engine()
        eventos = engine.process_line("")
        assert eventos == []

    def test_linha_somente_espacos_retorna_sem_eventos(self):
        """Linha com apenas espaços não deve gerar eventos."""
        engine = _make_engine()
        eventos = engine.process_line("   ")
        assert eventos == []

    def test_linha_sem_correspondencia_retorna_sem_eventos(self):
        """Linha que não corresponde a nenhuma regra deve retornar lista vazia."""
        engine = _make_engine()
        eventos = engine.process_line("Nenhuma regra corresponde a este texto.")
        assert eventos == []

    def test_process_line_retorna_lista(self):
        """process_line deve sempre retornar uma lista."""
        engine = _make_engine()
        result = engine.process_line("qualquer texto")
        assert isinstance(result, list)


class TestEngineStatusPadrao:
    """Testa os valores padrão dos atributos de estado."""

    def test_get_last_omit_status_padrao_falso(self):
        """get_last_omit_status deve retornar False antes de processar qualquer linha."""
        engine = _make_engine()
        assert engine.get_last_omit_status() is False

    def test_get_last_rewritten_text_padrao_none(self):
        """get_last_rewritten_text deve retornar None antes de processar qualquer linha."""
        engine = _make_engine()
        assert engine.get_last_rewritten_text() is None

    def test_omit_status_reset_apos_linha_sem_regra(self):
        """Após processar linha sem regra, omit_status deve continuar False."""
        engine = _make_engine()
        engine.process_line("linha sem regra")
        assert engine.get_last_omit_status() is False

    def test_rewritten_text_reset_apos_linha_sem_regra(self):
        """Após processar linha sem regra, rewritten_text deve continuar None."""
        engine = _make_engine()
        engine.process_line("linha sem regra")
        assert engine.get_last_rewritten_text() is None
