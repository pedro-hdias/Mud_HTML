# Changelog

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
