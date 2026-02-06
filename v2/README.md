# Web MUD Client - v1

Cliente web para jogar MUD via navegador.

## Como executar localmente

```bash
cd v1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Acesse: http://localhost:8000

## Como executar com Docker

```bash
cd v1
docker build -t mudclient .
docker run -p 8000:8000 mudclient
```

Acesse: http://localhost:8000
