# Web MUD Client

Cliente web para jogar MUD via navegador.

## Estrutura atual

- `v4/`: versão principal do projeto (FastAPI + frontend estático)
- `docker-compose.yml`: composição local simplificada (serviço `mud-html`)

O projeto `shamy` é independente e deve ser operado em stack própria fora deste repositório.

## Desenvolvimento local

```bash
docker compose up --build
```

- Serviço: `mud-html`
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
docker compose logs --tail 100 mud-html
```

## Imagem publicada

Também é possível rodar via GHCR:

```bash
docker run -p 80:80 ghcr.io/pedro-hdias/mud_html:latest
```
