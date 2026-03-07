"""
API de visualização de logs em tempo real.
"""
import os
import asyncio
import aiofiles
from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from ..logger import get_current_log_file_path
from . import check_debug_auth

router = APIRouter()


@router.get("/logs")
def logs_page(request: Request):
    """Página para visualizar logs em tempo real."""
    if not check_debug_auth(request):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    return FileResponse("static/logs.html")


@router.get("/api/logs/stream")
async def logs_stream(request: Request):
    """Stream de logs em tempo real usando Server-Sent Events."""
    if not check_debug_auth(request):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})

    async def event_generator():
        log_file = get_current_log_file_path()

        # Envia as últimas 50 linhas primeiro
        try:
            if os.path.exists(log_file):
                async with aiofiles.open(log_file, 'r', encoding='utf-8') as f:
                    lines = await f.readlines()
                    for line in lines[-50:]:
                        yield f"data: {line}\n\n"
        except Exception as e:
            yield f"data: [ERROR] Could not read log file: {e}\n\n"

        # Segue o arquivo em modo tail -f
        last_size = os.path.getsize(log_file) if os.path.exists(log_file) else 0

        try:
            while True:
                try:
                    if os.path.exists(log_file):
                        current_size = os.path.getsize(log_file)
                        if current_size > last_size:
                            async with aiofiles.open(log_file, 'r', encoding='utf-8') as f:
                                await f.seek(last_size)
                                new_content = await f.read()
                                for line in new_content.splitlines():
                                    if line.strip():
                                        yield f"data: {line}\n\n"
                            last_size = current_size
                        elif current_size < last_size:
                            # Arquivo foi truncado/recriado
                            last_size = 0

                    await asyncio.sleep(0.5)  # Verifica a cada 500ms
                except (asyncio.CancelledError, GeneratorExit):
                    return
                except Exception as e:
                    yield f"data: [ERROR] {e}\n\n"
                    await asyncio.sleep(1)
        except (asyncio.CancelledError, GeneratorExit):
            return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
