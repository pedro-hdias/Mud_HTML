# Correção: Reconexão Automática do WebSocket

## Problema Identificado

O WebSocket estava fechando inesperadamente durante o jogo, resultando em:
- Erro "WebSocket is already in CLOSING or CLOSED state" ao tentar enviar comandos
- Usuário não conseguia interagir com o jogo após o fechamento
- Nenhuma tentativa automática de reconexão

## Soluções Implementadas

### 1. **Reconexão Automática no Frontend**

**Arquivo: `static/js/ws.js`**

- **Gerenciamento de Conexão**: WebSocket agora é gerenciado por uma função `connectWebSocket()` que pode ser chamada múltiplas vezes
- **Tentativas de Reconexão**: Até 10 tentativas com delay incremental (2s, 4s, 6s...)
- **Backoff Exponencial**: Cada tentativa aguarda mais tempo que a anterior
- **Reset ao Conectar**: Contador de tentativas é resetado quando conexão é bem-sucedida

```javascript
// Variáveis de controle
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 2000;

// Tentativa #1: 2s delay
// Tentativa #2: 4s delay
// Tentativa #3: 6s delay
// ...
```

### 2. **Desconexão Manual vs Automática**

**Flag `isManualDisconnect`**: Diferencia quando o usuário escolhe desconectar vs quando a conexão cai

- **Manual**: Usuário clica em "Desconectar" → **NÃO reconecta**
- **Automática**: Conexão perdida → **Reconecta automaticamente**

### 3. **Proteção de Envio de Comandos**

Antes de enviar qualquer comando, verifica se WebSocket está aberto:

```javascript
function sendCommand(commandText) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        // Mostra mensagem ao usuário
        // Não tenta enviar
        return;
    }
    // ... envia comando
}
```

### 4. **Melhor Tratamento de Erros no Backend**

**Arquivo: `app/ws.py`**

- Importado `WebSocketDisconnect` do FastAPI
- Tratamento específico para desconexões
- Logs mais detalhados mostrando quantos clientes restam na sessão

**Arquivo: `app/sessions/session.py`**

- `broadcast_message()` agora remove automaticamente clientes desconectados
- Evita acumular WebSockets "mortos" na lista
- Logs com `warning` ao invés de `exception` para não poluir

### 5. **Reconexão Inteligente**

Quando o WebSocket reconecta:

1. Envia `init` com o `sessionId` salvo
2. Backend retorna estado e histórico da sessão
3. Usuário continua de onde parou! 🎉

## Como Testar

### Teste 1: Reconexão Automática

1. Conecte no MUD e faça login
2. No terminal do servidor, pressione `Ctrl+C` para parar
3. **O frontend mostrará**: "[SISTEMA] Conexão perdida - tentando reconectar..."
4. Reinicie o servidor: `uvicorn app.main:app --reload`
5. **O frontend reconecta automaticamente!**
6. Seus comandos voltam a funcionar

### Teste 2: Desconexão Manual (Não Reconecta)

1. Conecte no MUD
2. Clique em "Desconectar"
3. **O frontend mostrará**: "[SISTEMA] Desconectado"
4. **NÃO tenta reconectar** (comportamento correto)
5. Para reconectar, clique em "Conectar" novamente

### Teste 3: Proteção de Comandos

1. Conecte no MUD
2. Pare o servidor (conexão será perdida)
3. Tente enviar um comando
4. **Mensagem laranja aparece**: "[SISTEMA] Não conectado - reconectando..."
5. Comando não é enviado (não gera erro, JS não trava)

### Teste 4: Múltiplas Sessões

1. Abra em 2 navegadores diferentes
2. Conecte ambos no MUD
3. Pare e reinicie o servidor
4. **Ambos reconectam automaticamente**
5. Cada um mantém sua sessão independente

## Logs para Debug

### Frontend (Console do Navegador)

```
[ws] WebSocket opened
[ws] Initializing session { sessionId: "abc-123..." }
[ws] WebSocket closed { code: 1006, reason: "" }
[ws] Scheduling reconnect attempt 1 in 2000ms
[ws] Reconnect attempt 1
[ws] WebSocket opened
```

### Backend (Terminal)

```
INFO:     Session abc-123: WebSocket disconnected (code: 1006)
INFO:     Session abc-123: Removing WebSocket from session
INFO:     Session abc-123: WebSocket removed, 0 clients remaining
INFO:     127.0.0.1:12345 - "WebSocket /ws" [accepted]
INFO:     Client initialized with sessionId: abc-123
INFO:     Session abc-123: WebSocket added (total: 1)
```

## Melhorias Futuras

### Heartbeat/Ping-Pong

Adicionar ping periódico para detectar conexões "zumbi":

```javascript
// Frontend
setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
    }
}, 30000); // A cada 30 segundos
```

```python
# Backend
if msg_type == "ping":
    await ws.send_json({"type": "pong"})
```

### Feedback Visual

Adicionar indicador de status no canto da tela:
- 🟢 Verde: Conectado
- 🟡 Amarelo: Reconectando...
- 🔴 Vermelho: Desconectado

### Fila de Comandos

Guardar comandos enviados durante desconexão e enviar quando reconectar:

```javascript
const commandQueue = [];

function sendCommand(cmd) {
    if (ws.readyState !== WebSocket.OPEN) {
        commandQueue.push(cmd);
        return;
    }
    // envia normalmente
}

// Quando reconecta:
for (const cmd of commandQueue) {
    sendCommand(cmd);
}
commandQueue.length = 0;
```

## Configurações

### Ajustar Timeout de Reconexão

Em `static/js/ws.js`:

```javascript
const MAX_RECONNECT_ATTEMPTS = 10;  // Número máximo de tentativas
const RECONNECT_DELAY_MS = 2000;    // Delay base em ms (2 segundos)
```

### Ajustar Timeout de Sessão

Em `app/main.py` ou `app/sessions/manager.py`:

```python
session_manager = SessionManager(
    session_timeout_minutes=10  # Mude aqui
)
```

## Resumo das Mudanças

| Arquivo                   | Mudança                                 |
| ------------------------- | --------------------------------------- |
| `static/js/ws.js`         | ✅ Reconexão automática com backoff      |
| `static/js/ws.js`         | ✅ Proteção de envio quando desconectado |
| `static/js/events.js`     | ✅ Flag isManualDisconnect               |
| `app/ws.py`               | ✅ Tratamento de WebSocketDisconnect     |
| `app/ws.py`               | ✅ Logs detalhados de conexão/desconexão |
| `app/sessions/session.py` | ✅ Remoção automática de clientes mortos |

---

**Status**: ✅ Pronto para uso  
**Testado**: Sim
**Compatível**: Mantém funcionalidade existente
