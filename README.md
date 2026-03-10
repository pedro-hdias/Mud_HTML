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

### Publicar o diário em `/shamy/` (upload manual)

Se você for enviar os arquivos do diário manualmente (ex.: zip extraído), coloque o conteúdo em:

```text
v4/static/shamy/
```

Estrutura esperada:

```text
v4/static/shamy/index.html
v4/static/shamy/Entries/
v4/static/shamy/Resources/
```

Depois rode o build normal:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

URL final para a pessoa acessar direto:

```text
http://SEU_DOMINIO_OU_IP/shamy/
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
