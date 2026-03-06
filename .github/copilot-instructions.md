# Instruções para o Copilot

## Idioma

- Todas as respostas devem ser em **português**.
- Toda a documentação deve ser escrita em **português**.
- Comentários no código devem ser em **português**.

## Sobre o Projeto

Este repositório contém o **Web MUD Client** — um cliente web para jogar MUD (Multi-User Dungeon) via navegador. O backend é desenvolvido em **Python (FastAPI/Uvicorn)** e o frontend em **HTML, CSS e JavaScript puro**. A aplicação é empacotada e distribuída via **Docker**.

### Estrutura Principal

- `v3/app/` — Backend Python (FastAPI, WebSocket, sessões, sons)
- `v3/static/` — Frontend (HTML, CSS, JS)
- `v3/Dockerfile` — Imagem Docker da versão atual
- `docker-compose.yml` — Composição de serviços
- `.github/workflows/` — Pipelines de CI/CD

## Convenções de Código

### Python (Backend)

- Use **tipagem estática** (`typing`, `Final`, etc.) sempre que possível.
- Siga o estilo **PEP 8**.
- Use `Final` para constantes de configuração em `config.py`.
- Prefira `async`/`await` para operações de I/O.
- Mantenha a separação de responsabilidades: configuração em `config.py`, lógica de negócio nos módulos correspondentes.
- Use `get_logger(name)` do módulo `app.logger` para obter um logger nomeado.

### JavaScript (Frontend)

- Use JavaScript puro (sem frameworks).
- Centralize configurações em `config.js`.
- Use `createLogger("nome-do-modulo")` para logging consistente.
- Separe responsabilidades em arquivos distintos (ex: `prompts.js`, `sound-handler.js`, `ws.js`).

### HTML/CSS

- Mantenha acessibilidade (atributos `aria-*`, `role`, etc.).
- Use classes semânticas e evite estilos inline.

## Fluxo de Desenvolvimento

1. Branches de issue (ex: `*/issue42`) disparam o workflow `issue-to-develop.yml`, que abre automaticamente um PR para `develop`.
2. Funcionalidades são desenvolvidas em branches `feature/*` e integradas via PR para `develop`.
3. A branch `develop` é promovida para `main` via workflow `develop-to-main-release.yml`.
4. Releases são publicadas automaticamente pelo workflow `main-create-release.yml`.
5. Imagens Docker são publicadas no GitHub Container Registry pelo workflow `publish-docker.yml`.

## Testes

- Execute os testes com `pytest` a partir da pasta `v3/`.
- Mantenha cobertura de testes para módulos críticos (ex: `sounds`, `sessions`).

## Docker

- Para rodar localmente:
  ```bash
  docker run -p 80:80 ghcr.io/pedro-hdias/mud_html:latest
  ```
- Para buildar a imagem:
  ```bash
  cd v3
  docker build -t mudclient .
  docker run -d -p 80:80 mudclient
  ```
