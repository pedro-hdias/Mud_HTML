"""
Testes unitários para SendInterpreter.
Cobre: resolução de variáveis, avaliação de condições, estruturas de controle e funções.
"""

import random
import unittest
from unittest.mock import MagicMock, patch

from app.interpreter import SendInterpreter
from app.interpreter.state import _Settings, _ConfigTable


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def _make_interpreter(
    captures=None,
    variables=None,
    settings_data=None,
) -> SendInterpreter:
    """Cria um SendInterpreter com valores padrão para testes."""
    settings = _Settings(initial=settings_data or {})
    config_table = _ConfigTable(settings)
    return SendInterpreter(
        captures=captures or [],
        variables=variables or {},
        settings=settings,
        config_table=config_table,
        rng=random.Random(42),
    )


def _mock_registry(exists_return=True, get_return=None, resolve_return=None):
    """Cria um mock do SoundRegistry."""
    reg = MagicMock()
    reg.exists.return_value = exists_return
    reg.get.return_value = get_return
    reg.resolve_best.return_value = resolve_return
    reg.find_similar.return_value = []
    reg.get_stats.return_value = {"total_files": 0, "categories": {}, "total_categories": 0}
    return reg


# ──────────────────────────────────────────────
# 6.2.1 – Resolução de variáveis
# ──────────────────────────────────────────────

class TestVariableResolution:
    """Testa substituição de %0, %1, %2 pelas capturas de regex."""

    def test_resolucao_captura_zero(self):
        """Deve substituir %0 pelo match completo."""
        interp = _make_interpreter(captures=["linha completa", "grupo1"])
        result = interp._resolve_vars("Você viu: %0")
        assert result == "Você viu: linha completa"

    def test_resolucao_captura_um(self):
        """Deve substituir %1 pelo primeiro grupo de captura."""
        interp = _make_interpreter(captures=["completo", "guerreiro", "ataque"])
        result = interp._resolve_vars("Ação: %1")
        assert result == "Ação: guerreiro"

    def test_resolucao_captura_dois(self):
        """Deve substituir %2 pelo segundo grupo de captura."""
        interp = _make_interpreter(captures=["completo", "guerreiro", "espada"])
        result = interp._resolve_vars("Arma: %2")
        assert result == "Arma: espada"

    def test_substituicao_parcial(self):
        """Deve substituir apenas as variáveis presentes, mantendo o restante."""
        interp = _make_interpreter(captures=["completo", "valor1"])
        result = interp._resolve_vars("A=%1 e B=%2")
        # %2 não existe nas capturas, permanece sem alteração
        assert "valor1" in result
        assert "%2" in result

    def test_variavel_fora_do_intervalo(self):
        """Índice de captura inexistente deve permanecer inalterado."""
        interp = _make_interpreter(captures=["completo"])
        result = interp._resolve_vars("x=%5")
        assert result == "x=%5"

    def test_strip_quotes_aspas_duplas(self):
        """Remove aspas duplas de string literal."""
        interp = _make_interpreter()
        assert interp._strip_quotes('"hello"') == "hello"

    def test_strip_quotes_aspas_simples(self):
        """Remove aspas simples de string literal."""
        interp = _make_interpreter()
        assert interp._strip_quotes("'world'") == "world"

    def test_strip_quotes_sem_aspas(self):
        """String sem aspas permanece inalterada."""
        interp = _make_interpreter()
        assert interp._strip_quotes("noquotes") == "noquotes"

    def test_strip_quotes_aspas_mistas_nao_remove(self):
        """Aspas diferentes nas extremidades não são removidas."""
        interp = _make_interpreter()
        assert interp._strip_quotes("'misto\"") == "'misto\""


# ──────────────────────────────────────────────
# 6.2.2 – Avaliação de condições
# ──────────────────────────────────────────────

class TestConditionEvaluation:
    """Testa _eval_condition com comparações de string e número."""

    def test_if_then_end_executa_bloco(self):
        """Bloco if/end deve executar quando condição é verdadeira."""
        interp = _make_interpreter(settings_data={"Habilitado": 1})
        code = 'if settings.Habilitado == 1 then\n  Note("ativo")\nend'
        interp.run(code)
        assert interp.get_rewritten_text() == "ativo"

    def test_if_then_end_nao_executa_bloco_falso(self):
        """Bloco if/end não deve executar quando condição é falsa."""
        interp = _make_interpreter(settings_data={"Habilitado": 0})
        code = 'if settings.Habilitado == 1 then\n  Note("ativo")\nend'
        interp.run(code)
        assert interp.get_rewritten_text() is None

    def test_elseif_executa_ramo_correto(self):
        """elseif deve executar quando condição verdadeira e if foi falso.
        Usa settings para comparação numérica (modo suportado pelo interpretador).
        """
        interp = _make_interpreter(settings_data={"Modo": 2})
        code = (
            'if settings.Modo == 1 then\n'
            '  Note("modo_um")\n'
            'elseif settings.Modo == 2 then\n'
            '  Note("modo_dois")\n'
            'end'
        )
        interp.run(code)
        assert interp.get_rewritten_text() == "modo_dois"

    def test_else_executa_quando_condicoes_falsas(self):
        """else deve executar quando if e todos os elseif são falsos."""
        interp = _make_interpreter(settings_data={"Modo": 99})
        code = (
            'if settings.Modo == 1 then\n'
            '  Note("modo_um")\n'
            'else\n'
            '  Note("modo_outro")\n'
            'end'
        )
        interp.run(code)
        assert interp.get_rewritten_text() == "modo_outro"

    def test_comparacao_numero(self):
        """Comparação numérica de settings deve funcionar corretamente."""
        interp = _make_interpreter(settings_data={"Volume": 5})
        result = interp._eval_condition("settings.Volume == 5")
        assert result is True

    def test_comparacao_string_com_lua_match(self):
        """lua_match pode ser usado para comparação de string em condições."""
        interp = _make_interpreter(captures=["linha", "guerreiro"])
        # lua_match está disponível no safe_env do _eval_condition
        result = interp._eval_condition('lua_match("guerreiro", "guerreiro")')
        assert result is not None  # lua_match retorna string (truthy) em match

    def test_comparacao_numero_falsa(self):
        """Comparação numérica diferente deve retornar False."""
        interp = _make_interpreter(settings_data={"Volume": 3})
        result = interp._eval_condition("settings.Volume == 5")
        assert result is False

    def test_condicao_com_aspas_na_captura_nao_quebra_avaliacao(self):
        """Capturas com aspas duplas não devem invalidar a sintaxe da expressão."""
        interp = _make_interpreter(
            captures=["linha", "OOC", 'A pre-recorded message says, "teste"'],
        )
        result = interp._eval_condition(
            'string.match("%1", "OOC") and string.match("%2", "A pre\\-recorded message")'
        )
        assert result is True


# ──────────────────────────────────────────────
# 6.2.3 – Estruturas de controle
# ──────────────────────────────────────────────

class TestControlStructures:
    """Testa if/end, if/elseif/else/end, for e blocos aninhados."""

    def test_if_end_simples(self):
        """Bloco if/end com condição verdadeira deve executar."""
        interp = _make_interpreter(settings_data={"Ativo": 1})
        interp.run('if settings.Ativo == 1 then\n  Note("ok")\nend')
        assert interp.get_rewritten_text() == "ok"

    def test_if_elseif_else_end_completo(self):
        """Cadeia if/elseif/else/end deve executar apenas o ramo correto.
        Usa settings para comparação (modo suportado pelo interpretador).
        """
        interp = _make_interpreter(settings_data={"Ramo": 2})
        code = (
            'if settings.Ramo == 1 then\n'
            '  Note("ramo_a")\n'
            'elseif settings.Ramo == 2 then\n'
            '  Note("ramo_b")\n'
            'else\n'
            '  Note("ramo_else")\n'
            'end'
        )
        interp.run(code)
        assert interp.get_rewritten_text() == "ramo_b"

    @patch("app.interpreter.get_registry")
    def test_for_executa_n_vezes(self, mock_get_registry):
        """Bloco for deve executar o número correto de iterações."""
        mock_get_registry.return_value = _mock_registry(
            get_return="General/Misc/Test.ogg",
        )
        interp = _make_interpreter()
        interp.run(
            'for i = 1, 3 do\n'
            '  PlayGlobalSound("General/Misc/Test.ogg")\n'
            'end'
        )
        play_events = [e for e in interp._events if e.get("action") == "play"]
        assert len(play_events) == 3

    def test_bloco_vazio_nao_gera_erro(self):
        """Bloco if/end vazio não deve gerar exceção."""
        interp = _make_interpreter(settings_data={"Ativo": 1})
        interp.run('if settings.Ativo == 1 then\nend')
        assert interp.get_rewritten_text() is None

    def test_if_aninhado_executa_corretamente(self):
        """if aninhado deve executar somente quando ambas as condições são verdadeiras."""
        interp = _make_interpreter(settings_data={"A": 1, "B": 1})
        code = (
            'if settings.A == 1 then\n'
            '  if settings.B == 1 then\n'
            '    Note("ambos")\n'
            '  end\n'
            'end'
        )
        interp.run(code)
        assert interp.get_rewritten_text() == "ambos"

    def test_if_aninhado_nao_executa_quando_externo_falso(self):
        """if aninhado não deve executar quando if externo é falso."""
        interp = _make_interpreter(settings_data={"A": 0, "B": 1})
        code = (
            'if settings.A == 1 then\n'
            '  if settings.B == 1 then\n'
            '    Note("ambos")\n'
            '  end\n'
            'end'
        )
        interp.run(code)
        assert interp.get_rewritten_text() is None


# ──────────────────────────────────────────────
# 6.2.4 – Funções suportadas
# ──────────────────────────────────────────────

class TestSupportedFunctions:
    """Testa PlayGlobalSound, PlayCombatSound, StopSound e Note."""

    @patch("app.interpreter.get_registry")
    def test_play_global_sound_adiciona_evento(self, mock_get_registry):
        """PlayGlobalSound deve adicionar evento de play na lista de eventos."""
        mock_get_registry.return_value = _mock_registry(
            get_return="General/Misc/Test.ogg",
        )
        interp = _make_interpreter()
        interp.run('PlayGlobalSound("General/Misc/Test.ogg")')
        events = interp._events
        assert len(events) == 1
        assert events[0]["action"] == "play"
        assert events[0]["channel"] == "global"

    @patch("app.interpreter.get_registry")
    def test_play_combat_sound_adiciona_evento(self, mock_get_registry):
        """PlayCombatSound deve adicionar evento de play com channel=combat."""
        mock_get_registry.return_value = _mock_registry(
            get_return="Combat/Test.ogg",
        )
        interp = _make_interpreter()
        interp.run('PlayCombatSound("Combat/Test.ogg")')
        events = interp._events
        assert len(events) == 1
        assert events[0]["action"] == "play"
        assert events[0]["channel"] == "combat"

    def test_stop_sound_adiciona_evento_stop(self):
        """StopSound deve adicionar evento de stop com target correto."""
        interp = _make_interpreter()
        interp.run('StopSound("s1")')
        events = interp._events
        assert len(events) == 1
        assert events[0]["action"] == "stop"
        assert events[0]["target"] == "s1"

    def test_note_define_rewritten_text(self):
        """Note deve definir o texto reescrito da sessão."""
        interp = _make_interpreter()
        interp.run('Note("hello world")')
        assert interp.get_rewritten_text() == "hello world"

    def test_note_com_captura(self):
        """Note com %0 deve resolver a captura antes de armazenar."""
        interp = _make_interpreter(captures=["linha original"])
        interp.run('Note("Você viu: %0")')
        assert interp.get_rewritten_text() == "Você viu: linha original"

    @patch("app.interpreter.get_registry")
    def test_play_global_sound_path_no_evento(self, mock_get_registry):
        """O path normalizado deve aparecer no evento gerado."""
        normalizado = "General/Misc/Test.ogg"
        mock_get_registry.return_value = _mock_registry(
            get_return=normalizado,
        )
        interp = _make_interpreter()
        interp.run(f'PlayGlobalSound("{normalizado}")')
        assert interp._events[0]["path"] == normalizado

    @patch("app.interpreter.get_registry")
    def test_play_global_sound_path_nao_encontrado_sem_fallback_descarta_evento(self, mock_get_registry):
        """Quando path não existe no registry E fallback também não existe,
        nenhum evento é emitido (comportamento correto: não enviar path=None ao cliente).
        """
        reg = _mock_registry(get_return=None, resolve_return=None)
        mock_get_registry.return_value = reg
        interp = _make_interpreter()
        interp.run('PlayGlobalSound("General/Misc/Test.ogg")')
        # Sem arquivo e sem fallback, nenhum evento de play deve ser emitido
        play_events = [e for e in interp._events if e.get("action") == "play"]
        assert len(play_events) == 0

    @patch("app.interpreter.get_registry")
    def test_social_sem_arquivo_especifico_usa_fallback_da_categoria(self, mock_get_registry):
        """Sociais conhecidas sem arquivo direto devem usar um alias mais natural da categoria."""
        reg = _mock_registry(get_return=None, resolve_return=None)

        def _registry_get(path):
            if path in {"Socials/Chuckle.ogg", "Socials/Say.ogg"}:
                return path
            return None

        reg.get.side_effect = _registry_get
        reg.resolve_best.return_value = None
        mock_get_registry.return_value = reg

        interp = _make_interpreter(captures=["linha", "channel", "male", "grin"])
        interp.run('PlayGlobalSound("Socials/%3.ogg")')

        play_events = [e for e in interp._events if e.get("action") == "play"]
        assert len(play_events) == 1
        assert play_events[0]["path"] == "Socials/Chuckle.ogg"


# ──────────────────────────────────────────────
# 6.2.5 – Validação de paths
# ──────────────────────────────────────────────

class TestPathValidation:
    """Testa _is_valid_sound_path para aceitar/rejeitar caminhos."""

    def test_path_valido(self):
        """Caminho válido com diretório e extensão .ogg deve ser aceito."""
        interp = _make_interpreter()
        assert interp._is_valid_sound_path("General/Misc/Test.ogg") is True

    def test_path_invalido_muito_curto(self):
        """Caminho muito curto (sem diretório) deve ser rejeitado."""
        interp = _make_interpreter()
        assert interp._is_valid_sound_path("n.ogg") is False

    def test_path_invalido_path_traversal(self):
        """Caminho com traversal (..) deve ser rejeitado."""
        interp = _make_interpreter()
        assert interp._is_valid_sound_path("../evil.ogg") is False

    def test_path_invalido_sem_extensao_ogg(self):
        """Caminho sem extensão .ogg deve ser rejeitado."""
        interp = _make_interpreter()
        assert interp._is_valid_sound_path("General/Misc/Test.mp3") is False

    def test_path_invalido_stem_unico_caractere(self):
        """Stem de 1 caractere (ex: n.ogg em subdiretório) deve ser rejeitado."""
        interp = _make_interpreter()
        assert interp._is_valid_sound_path("General/Channels/n.ogg") is False

    def test_path_invalido_none(self):
        """None deve ser rejeitado."""
        interp = _make_interpreter()
        assert interp._is_valid_sound_path(None) is False

    def test_path_invalido_vazio(self):
        """String vazia deve ser rejeitada."""
        interp = _make_interpreter()
        assert interp._is_valid_sound_path("") is False

    def test_path_valido_com_subdiretorios(self):
        """Caminho com múltiplos subdiretórios deve ser aceito."""
        interp = _make_interpreter()
        assert interp._is_valid_sound_path("General/Rooms/Forest/Ambient.ogg") is True

    def test_path_invalido_sem_barra(self):
        """Caminho sem barra separadora deve ser rejeitado."""
        interp = _make_interpreter()
        assert interp._is_valid_sound_path("TestSound.ogg") is False
