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

O deploy de produção é disparado automaticamente quando uma release é publicada no GitHub.

Subir manualmente em modo produção, se necessário:

```bash
docker compose down --remove-orphans
docker compose up -d --build --remove-orphans
```

Atualizar versão na VPS manualmente (contingência):

```bash
git fetch --all --tags --prune
git checkout main
git pull --ff-only origin main
docker compose down --remove-orphans
docker compose up -d --build --remove-orphans
```

A porta do frontend pode ser parametrizada por variáveis de ambiente:

```bash
FRONTEND_BIND_HOST=127.0.0.1
FRONTEND_PORT=18080
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
