# Changelog

## v3.1 (2026-03-02)

### Added
- pacote de áudio modular em `v3/static/js/audio/` com separação por contexto, buffer, registry, playback, controles, estado e ponto de entrada
- fila de envio de comandos no WebSocket com rate limiting aleatório para macros e preservação de ordem
- modelo de fase de sessão no front-end (`UNAUTHENTICATED`, `AUTH_IN_PROGRESS`, `IN_GAME`) com transições idempotentes
- detecção de entrada em jogo por padrões de linha recebida para transição automática de fase
- tratamento centralizado e idempotente de desconexão para limpeza de fila de saída e reset de menu
- normalização case-insensitive de caminhos de áudio no interpretador de `send(...)`, retornando capitalização canônica do arquivo

### Changed
- carregamento de scripts de áudio em `v3/static/index.html` passou de arquivo único para pipeline modular com ordem explícita de dependências
- resolução de nomes no registry de áudio (`resolve`) agora aceita busca case-insensitive para nomes semânticos
- detecção de menu em `v3/static/js/menu.js` ganhou terminador por `[Input]`, reset por `Valid commands are:` e redução de logs repetitivos
- cliques de menu passaram a respeitar fase da sessão (somente durante estado não autenticado)
- processamento de mensagens WebSocket prioriza log `debug` para payload bruto e sincroniza fase de autenticação no envio de login

## v3 (2026-02-14)

### Added
- motor de sons Prometheus com parser de regras do Prometheus.xml e interpretador de blocos send (subset Lua)
- eventos de som no backend e handler no front-end (SoundHandler) com suporte a play/stop e delays
- engine de audio WebAudio (MudAudio) com cache, pan, volume, mute, delay e registry de sons
- rate limit de mensagens WebSocket, codigos de fechamento padronizados e validacao basica de schema
- endpoints de debug (/sessions, /logs) protegidos por header e stream SSE de logs, alem de /health e /audio
- deteccao de menus interativos a partir de linhas numeradas e atalho de selecao
- parsing de cores ANSI no output e trim de linhas com baixo custo de reflow
- reconexao com backoff exponencial + jitter, estado explicito de reconexao e fila de comandos

### Changed
- protocolo WS padronizado com mensagens { type, payload, meta } e init obrigatorio
- sessao com controle de historico (limites de bytes/linhas) e buffer parcial com flush seguro
- gerenciador de sessoes com timeout, limpeza periodica e limite MAX_SESSIONS
- scripts do front-end reorganizados (state, events, menu, ui, ws, sound-handler)

### Removed
- arvores v1/ e v2/ removidas do branch v3 (codigo migrado para v3/)

### Migration Notes
- clientes customizados podem enviar mensagens com payload/meta; comandos raw continuam aceitos
- ajuste seus scripts/paths para usar a pasta v3/ e os novos arquivos JS
