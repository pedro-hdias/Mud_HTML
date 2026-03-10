"""
Testes unitários para MudSession.
Cobre: criação, touch, WebSocket, histórico e trimming.
"""

import time
from unittest.mock import MagicMock, patch

from fastapi import WebSocket


# ──────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────

def _make_session(public_id: str = "test-session-01") -> "MudSession":
    """Cria uma MudSession com get_sound_engine mockado."""
    with patch("app.sessions.session.get_sound_engine", return_value=MagicMock()):
        from app.sessions.session import MudSession
        session = MudSession(public_id=public_id)
    return session


def _mock_websocket() -> MagicMock:
    """Cria um WebSocket mock."""
    ws = MagicMock(spec=WebSocket)
    return ws


# ──────────────────────────────────────────────
# Testes de criação
# ──────────────────────────────────────────────

class TestSessionCriacao:
    """Testa criação e atributos iniciais da sessão."""

    def test_session_criacao_com_public_id(self):
        """Sessão deve ser criada com o public_id fornecido."""
        session = _make_session("minha-sessao")
        assert session.public_id == "minha-sessao"

    def test_session_tem_owner_token(self):
        """Sessão deve ter um owner_token gerado automaticamente."""
        session = _make_session()
        assert session.owner_token is not None
        assert len(session.owner_token) > 0

    def test_session_owner_token_unico(self):
        """Duas sessões devem ter owner_tokens diferentes."""
        s1 = _make_session("s1")
        s2 = _make_session("s2")
        assert s1.owner_token != s2.owner_token

    def test_session_historico_inicial_vazio(self):
        """Histórico inicial deve ser uma string vazia."""
        session = _make_session()
        assert session.history == ""

    def test_session_sem_clientes_inicialmente(self):
        """Sessão não deve ter clientes WebSocket ao ser criada."""
        session = _make_session()
        assert session.has_clients() is False


# ──────────────────────────────────────────────
# Testes de touch
# ──────────────────────────────────────────────

class TestSessionTouch:
    """Testa atualização de last_activity via touch()."""

    def test_touch_atualiza_last_activity(self):
        """touch() deve atualizar o timestamp de last_activity."""
        session = _make_session()
        timestamp_antes = session.last_activity
        time.sleep(0.01)
        session.touch()
        assert session.last_activity > timestamp_antes


# ──────────────────────────────────────────────
# Testes de WebSocket
# ──────────────────────────────────────────────

class TestSessionWebSocket:
    """Testa adição e remoção de clientes WebSocket."""

    def test_adicionar_websocket(self):
        """Deve ser possível adicionar um cliente WebSocket."""
        session = _make_session()
        ws = _mock_websocket()
        session.add_websocket(ws)
        assert ws in session.websocket_clients

    def test_remover_websocket(self):
        """Deve ser possível remover um cliente WebSocket previamente adicionado."""
        session = _make_session()
        ws = _mock_websocket()
        session.add_websocket(ws)
        session.remove_websocket(ws)
        assert ws not in session.websocket_clients

    def test_remover_websocket_inexistente_nao_levanta_erro(self):
        """Remover WebSocket não existente não deve levantar exceção."""
        session = _make_session()
        ws = _mock_websocket()
        session.remove_websocket(ws)  # não deve gerar exceção

    def test_has_clients_true_com_websocket(self):
        """has_clients() deve retornar True quando há pelo menos um WebSocket."""
        session = _make_session()
        session.add_websocket(_mock_websocket())
        assert session.has_clients() is True

    def test_has_clients_false_sem_websocket(self):
        """has_clients() deve retornar False quando não há WebSockets."""
        session = _make_session()
        assert session.has_clients() is False

    def test_has_clients_false_apos_remover_todos(self):
        """has_clients() deve retornar False após remover todos os WebSockets."""
        session = _make_session()
        ws = _mock_websocket()
        session.add_websocket(ws)
        session.remove_websocket(ws)
        assert session.has_clients() is False


# ──────────────────────────────────────────────
# Testes de histórico
# ──────────────────────────────────────────────

class TestSessionHistorico:
    """Testa get_recent_history, _append_history e trimming."""

    def test_get_recent_history_vazio(self):
        """get_recent_history em sessão sem histórico deve retornar string vazia."""
        session = _make_session()
        assert session.get_recent_history() == ""

    def test_get_recent_history_retorna_ultimas_linhas(self):
        """get_recent_history deve retornar as últimas N linhas do histórico."""
        session = _make_session()
        session.history = "linha1\nlinha2\nlinha3\nlinha4\nlinha5\n"
        result = session.get_recent_history(num_lines=3)
        linhas = [l for l in result.split("\n") if l]
        assert len(linhas) <= 3
        assert "linha5" in result

    def test_get_recent_history_menos_linhas_que_pedido(self):
        """Quando histórico tem menos linhas que pedido, retorna tudo."""
        session = _make_session()
        session.history = "linha1\nlinha2"
        result = session.get_recent_history(num_lines=10)
        assert "linha1" in result
        assert "linha2" in result

    def test_append_history_adiciona_texto(self):
        """_append_history deve acrescentar texto ao histórico."""
        session = _make_session()
        session._append_history("nova linha\n")
        assert "nova linha" in session.history

    def test_append_history_texto_vazio_nao_altera(self):
        """_append_history com string vazia não deve alterar o histórico."""
        session = _make_session()
        session.history = "original\n"
        session._append_history("")
        assert session.history == "original\n"

    def test_history_trimming_por_linhas(self):
        """Quando HISTORY_MAX_LINES é excedido, o histórico deve ser aparado."""
        session = _make_session()
        # Preenche com mais linhas do que HISTORY_MAX_LINES
        with patch("app.sessions.session.HISTORY_MAX_LINES", 5):
            with patch("app.sessions.session.HISTORY_MAX_BYTES", 0):
                for i in range(10):
                    session._append_history(f"linha{i}\n")
        linhas = [l for l in session.history.splitlines() if l]
        assert len(linhas) <= 5

    def test_history_trimming_por_bytes(self):
        """Quando HISTORY_MAX_BYTES é excedido, o histórico deve ser aparado."""
        session = _make_session()
        texto_grande = "x" * 1000 + "\n"
        with patch("app.sessions.session.HISTORY_MAX_BYTES", 500):
            with patch("app.sessions.session.HISTORY_MAX_LINES", 0):
                for _ in range(10):
                    session._append_history(texto_grande)
        assert len(session.history) <= 500
