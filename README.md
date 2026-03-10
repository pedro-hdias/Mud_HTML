# Web MUD Client

Cliente web para jogar MUD via navegador.

## Estrutura atual

- `v4/`: versão principal do projeto (FastAPI + frontend estático)
- `docker-compose.yml`: composição de desenvolvimento (hot reload e volume local)
- `docker-compose.prod.yml`: composição de produção (VPS)

## Desenvolvimento local

```bash
docker compose up --build
```

- Serviço: `mud-html-dev`
- Porta: `80`
- Usa hot reload (`--reload`) e bind mount da pasta `v4/`

## Produção (VPS)

Subir em modo produção:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Atualizar versão na VPS (pull + rebuild + restart):

```bash
git pull --ff-only
docker compose -f docker-compose.prod.yml up -d --build
```

Verificar status:

```bash
docker compose -f docker-compose.prod.yml ps
docker logs --tail 100 mud-html
```

## Imagem publicada

Também é possível rodar via GHCR:

```bash
docker run -p 80:80 ghcr.io/pedro-hdias/mud_html:latest
```
