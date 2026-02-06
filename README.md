# Web MUD Client

Cliente web para jogar MUD via navegador.

## 🚀 Início Rápido (Usando Docker Hub)

A forma mais rápida de rodar o cliente:

```bash
docker run -p 8000:8000 ghcr.io/pedro-hdias/mud_html:latest
```

Acesse: [http://localhost:8000](http://localhost:8000)

### Versões disponíveis:
- `latest` - Última versão estável
- `v2-latest` - Última versão da v2
- `v1-latest` - Última versão da v1
- `v2.26.02.06` - Versão específica

## 📦 Como executar localmente

```bash
cd v2  # ou v1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Acesse: [http://localhost:8000](http://localhost:8000)

## 🐳 Como buildar com Docker

```bash
cd v2  # ou v1
docker build -t mudclient .
docker run -p 8000:8000 mudclient
```

Acesse: [http://localhost:8000](http://localhost:8000)
