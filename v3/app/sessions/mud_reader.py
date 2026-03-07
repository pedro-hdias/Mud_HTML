"""
MudReader - Loop de leitura de dados do servidor MUD
"""
import asyncio

from ..mud import parser
from ..mud.state import ConnectionState
from ..config import (
    MUD_READ_BUFFER_SIZE,
    MUD_PARTIAL_BUFFER_MAX_BYTES,
)
from ..ws_messages import make_message
from ..logger import get_logger

logger = get_logger("mud_reader")


class MudReader:
    """Loop de leitura de dados do MUD."""

    def __init__(self, session) -> None:
        """
        Args:
            session: Instância de MudSession (para acessar connection, history,
                     broadcaster, sound_engine, menu_detector, etc.)
        """
        self._session = session

    async def run(self) -> None:
        """Loop principal de leitura. Executa até desconexão ou cancelamento."""
        session = self._session

        while True:
            try:
                data = await session.reader.read(MUD_READ_BUFFER_SIZE)
                if not data:
                    # Conexão encerrada pelo servidor
                    await session.disconnect_from_mud()
                    await session.broadcast_message(
                        make_message("system", {"message": "Connection closed by server"})
                    )
                    break

                text = data.decode(errors="ignore")
                session.partial_buffer += text
                session._append_history(text)

                # Processa linhas completas
                while "\n" in session.partial_buffer:
                    if "\r\n" in session.partial_buffer:
                        line, session.partial_buffer = session.partial_buffer.split("\r\n", 1)
                        line += "\r\n"
                    else:
                        line, session.partial_buffer = session.partial_buffer.split("\n", 1)
                        line += "\n"

                    if parser.detect_disconnection(line):
                        await session.broadcast_message(make_message("line", {"content": line}))
                        await session.disconnect_from_mud()
                        await session.broadcast_message(
                            make_message("system", {"message": "Disconnected from server"})
                        )
                        return

                    menu_outputs = session.menu_detector.process_line(line)

                    for output_item in menu_outputs:
                        if output_item.get("type") == "menu":
                            await session.broadcast_message(
                                make_message("menu", output_item.get("payload", {}))
                            )
                            continue

                        output_line = output_item.get("content", "")
                        if not output_line:
                            continue

                        # Processa sons e rastreia omissão/reescrita
                        sound_events = session.sound_engine.process_line(output_line)
                        if sound_events:
                            await session.broadcast_message(
                                make_message("sound", {"events": sound_events})
                            )

                        should_omit = session.sound_engine.get_last_omit_status()
                        rewritten_text = session.sound_engine.get_last_rewritten_text()

                        if should_omit:
                            # Se omit_from_output=True, não envia linha original
                            if rewritten_text:
                                # Mas se foi reescrita via Note(), envia versão reescrita
                                await session.broadcast_message(
                                    make_message("line", {"content": rewritten_text})
                                )
                            # Senão, suprime totalmente
                        else:
                            await session.broadcast_message(
                                make_message("line", {"content": output_line})
                            )

                # Flush do buffer parcial (prompts sem newline)
                if session.partial_buffer:
                    if len(session.partial_buffer) > MUD_PARTIAL_BUFFER_MAX_BYTES:
                        # Proteção: flush forçado se buffer exceder limite
                        logger.warning(
                            f"Session {session.public_id}: Buffer parcial excedeu limite "
                            f"({len(session.partial_buffer)} bytes), forçando flush"
                        )
                        session.sound_engine.process_line(session.partial_buffer)
                        should_omit = session.sound_engine.get_last_omit_status()
                        rewritten_text = session.sound_engine.get_last_rewritten_text()

                        if not should_omit or rewritten_text:
                            content = rewritten_text if rewritten_text else session.partial_buffer
                            await session.broadcast_message(
                                make_message("line", {"content": content})
                            )
                        session.partial_buffer = ""
                    elif (
                        len(session.partial_buffer) < 1024
                        or parser.detect_input_prompt(session.partial_buffer)
                    ):
                        session.sound_engine.process_line(session.partial_buffer)
                        should_omit = session.sound_engine.get_last_omit_status()
                        rewritten_text = session.sound_engine.get_last_rewritten_text()

                        if not should_omit or rewritten_text:
                            content = rewritten_text if rewritten_text else session.partial_buffer
                            await session.broadcast_message(
                                make_message("line", {"content": content})
                            )
                        session.partial_buffer = ""

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception(
                    f"Session {session.public_id}: Erro ao ler do MUD: {e}"
                )
                await session.disconnect_from_mud()
                await session.broadcast_message(
                    make_message("system", {"message": f"Connection error: {e}"})
                )
                break
