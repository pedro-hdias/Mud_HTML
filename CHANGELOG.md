# Changelog

## v3.3 (2026-03-06)

### Corrigido (issue #45 — the eternal connection)
- adicionado timeout de 10 segundos na tentativa de conexão TCP ao servidor MUD (`connect_to_mud`), evitando que o cliente ficasse preso indefinidamente no estado "Connecting..." quando o servidor estava indisponível
- botão "Cancel attempt" agora também é exibido durante o estado inicial de conexão (`CONNECTING`), permitindo ao usuário cancelar sem precisar aguardar o timeout
- ao cancelar a tentativa, o WebSocket é encerrado corretamente independente do estado (`CONNECTING` ou `OPEN`), garantindo limpeza completa no backend
- a área de saída agora é limpa automaticamente ao iniciar uma nova tentativa de conexão a partir do estado desconectado, removendo mensagens de erro de tentativas anteriores (ex.: "[SYSTEM] Failed to connect to server")
- o status de conexão exibido na interface passou a usar inglês consistente (`Connecting...`, `Connected`, `Disconnected`, `Reconnecting...`, `Awaiting login`), em vez de português
- mensagens do sistema enviadas pelo backend (`Connection closed by server`, `Disconnected from server`, `Connection error`) traduzidas para inglês

## v3.2 (2026-03-03)

### Adicionado
- atributos ARIA ao controle de volume para melhor acessibilidade com leitores de tela
- skip links e roles ARIA nas páginas de logs e sessões para melhor navegação por teclado
- elementos visualmente ocultos (`visually-hidden`) para leitores de tela
- tratamento de mensagem `history_slice` no WebSocket para carregamento de histórico paginado
- método `dismissConfirmModal` no `ModalManager` para fechar o modal de confirmação sem resposta
- classe `MenuDetector` no backend para processamento de menus interativos
- classe `SoundRegistry` para gerenciamento e diagnóstico de arquivos de som
- arquivo de teste HTML para a funcionalidade do botão de carregamento de histórico

### Alterado
- container de menu isolado em `div` separada com `aria-live="polite"`, desacoplado do output principal
- menus interativos agora renderizam no container separado para evitar releitura pelo leitor de tela
- funções de mensagem do sistema padronizadas com convenção de nomenclatura consistente
- CSS aprimorado com suporte a responsividade e estilos de foco para acessibilidade
- logs de áudio no `SoundHandler` enriquecidos com mensagens detalhadas de sucesso e erro
- simplificada a fila de comandos de saída no `ws.js` para envio imediato

### Removido
- código obsoleto de configuração de menu removido do `menu.js`

## v3.1 (2026-03-02)

### Adicionado
- pacote de áudio modular em `v3/static/js/audio/` com separação por contexto, buffer, registry, playback, controles, estado e ponto de entrada
- fila de envio de comandos no WebSocket com rate limiting aleatório para macros e preservação de ordem
- modelo de fase de sessão no front-end (`UNAUTHENTICATED`, `AUTH_IN_PROGRESS`, `IN_GAME`) com transições idempotentes
- detecção de entrada em jogo por padrões de linha recebida para transição automática de fase
- tratamento centralizado e idempotente de desconexão para limpeza de fila de saída e reset de menu
- normalização case-insensitive de caminhos de áudio no interpretador de `send(...)`, retornando capitalização canônica do arquivo

### Alterado
- carregamento de scripts de áudio em `v3/static/index.html` passou de arquivo único para pipeline modular com ordem explícita de dependências
- resolução de nomes no registry de áudio (`resolve`) agora aceita busca case-insensitive para nomes semânticos
- detecção de menu em `v3/static/js/menu.js` ganhou terminador por `[Input]`, reset por `Valid commands are:` e redução de logs repetitivos
- cliques de menu passaram a respeitar fase da sessão (somente durante estado não autenticado)
- processamento de mensagens WebSocket prioriza log `debug` para payload bruto e sincroniza fase de autenticação no envio de login

### Removido
- arquivo monolítico `v3/static/js/audio.js`, substituído pelo pacote modular em `v3/static/js/audio/`
- artefatos binários versionados no repositório raiz: `mud_html_v1.26.02.06.1205.zip`, `mud_html_v1.26.02.07.2233.zip`, `mud_html_v2.26.02.10.2006.zip` e `mud_html_v3.26.02.14.1752.zip`

## v3 (2026-02-14)

### Adicionado
- motor de sons Prometheus com parser de regras do Prometheus.xml e interpretador de blocos send (subset Lua)
- eventos de som no backend e handler no front-end (SoundHandler) com suporte a play/stop e delays
- engine de audio WebAudio (MudAudio) com cache, pan, volume, mute, delay e registry de sons
- rate limit de mensagens WebSocket, codigos de fechamento padronizados e validacao basica de schema
- endpoints de debug (/sessions, /logs) protegidos por header e stream SSE de logs, alem de /health e /audio
- deteccao de menus interativos a partir de linhas numeradas e atalho de selecao
- parsing de cores ANSI no output e trim de linhas com baixo custo de reflow
- reconexao com backoff exponencial + jitter, estado explicito de reconexao e fila de comandos

### Alterado
- protocolo WS padronizado com mensagens { type, payload, meta } e init obrigatorio
- sessao com controle de historico (limites de bytes/linhas) e buffer parcial com flush seguro
- gerenciador de sessoes com timeout, limpeza periodica e limite MAX_SESSIONS
- scripts do front-end reorganizados (state, events, menu, ui, ws, sound-handler)

### Removido
- arvores v1/ e v2/ removidas do branch v3 (codigo migrado para v3/)

### Notas de Migração
- clientes customizados podem enviar mensagens com payload/meta; comandos raw continuam aceitos
- ajuste seus scripts/paths para usar a pasta v3/ e os novos arquivos JS
