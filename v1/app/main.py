from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .ws import websocket_endpoint
from .logger import get_logger

app = FastAPI()
logger = get_logger("main")

# Monta arquivos estáticos
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.on_event("startup")
async def on_startup():
    logger.debug("Application startup")

@app.on_event("shutdown")
async def on_shutdown():
    logger.debug("Application shutdown")

@app.get("/")
def index():
    return FileResponse("static/index.html")

@app.websocket("/ws")
async def websocket_route(websocket: WebSocket):
    try:
        logger.debug("WebSocket route invoked")
        await websocket_endpoint(websocket)
    except Exception as e:
        logger.exception(f"WebSocket error during handshake: {e}")
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except:
            pass
