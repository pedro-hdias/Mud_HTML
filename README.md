# Web MUD Client

Cliente web para jogar MUD via navegador.

## Estrutura

- `backend/`: backend Python (FastAPI, WebSocket, sessões, sons, testes)
- `frontend/`: frontend estático (HTML, CSS, JS e assets)
- `docker-compose.yml`: composição local com serviços `mud-backend` e `mud-frontend`
- `VERSION`: versão base usada para tags de release no GitHub Actions

O projeto `shamy` é independente e deve ser operado em stack própria fora deste repositório.

## Desenvolvimento local

```bash
docker compose up --build
```

- Serviço público: `mud-frontend`
- Serviço interno: `mud-backend`
- Porta local: `127.0.0.1:18080`

Este repositório não publica nem gerencia o `shamy`.

## Produção (VPS)

Subir em modo produção:

```bash
docker compose up -d --build
```

Atualizar versão na VPS (pull + rebuild + restart):

```bash
git pull --ff-only
docker compose up -d --build
```

Verificar status:

```bash
docker compose ps
docker compose logs --tail 100 mud-frontend
docker compose logs --tail 100 mud-backend
```

## Testes

```bash
cd backend
python -m pytest
```
