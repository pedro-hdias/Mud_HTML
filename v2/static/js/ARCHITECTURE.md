# Arquitetura dos Scripts JavaScript - Refatoração Concluída

## Visão Geral

Os scripts foram refatorados de 4 arquivos grandes para 9 módulos small-focused, seguindo o princípio de **responsabilidade única**.

## Dependências de Carregamento

```
logger.js
  ↓
config.js
  ↓
storage.js ← modals.js
  ↓           ↓
prompts.js   state.js
  ↓              ↓
  events.js
    ↓
   ui.js
    ↓
   ws.js (usa todos)
```

## Arquivos

### 1. **logger.js** (18 linhas)
Função auxiliar para criar loggers com prefixo de timestamp e módulo.
```javascript
const logger = createLogger("moduleName");
logger.log("message");
```
**Responsabilidade:** Logging estruturado.

---

### 2. **config.js** (82 linhas)
Configurações centralizadas da aplicação.

**Contém:**
- URLs (`WS_URL`)
- Chaves de armazenamento (`STORAGE_KEYS`)
- Seletores DOM (`SELECTORS`)
- Constantes (classes CSS, timeouts, padrões regex)

**Benefícios:**
- Fácil manutenção de valores mágicos
- Cache de seletores DOM com `getElement()`
- Reutilização de constantes

---

### 3. **storage.js** (108 linhas)
Gerenciador centralizado de cookies e localStorage.

**API:**
- `setCookie()`, `getCookie()`, `deleteCookie()`
- `setItem()`, `getItem()`, `removeItem()`
- Métodos de conveniência: `saveCredentials()`, `getCredentials()`, `setLoggedIn()`, etc.

**Benefícios:**
- Tratamento de erros centralizado
- Logging estruturado de operações de storage
- Abstração de persistence (fácil trocar localStorage por IndexedDB)

---

### 4. **prompts.js** (27 linhas)
Detector de prompts de confirmação do servidor.

**API:**
- `PromptDetector.shouldShowConfirmPrompt(line)` - Verifica se linha é um prompt
- `PromptDetector.buildConfirmMessage(line)` - Constrói mensagem com contexto

**Benefícios:**
- Padrões regex centralizados
- Reutilizável em diferentes contextos

---

### 5. **modals.js** (89 linhas)  
Gerenciador de modais (login e confirmação).

**API:**
- `ModalManager.showLoginModal()`
- `ModalManager.hideLoginModal()`
- `ModalManager.showConfirmModal(message)`
- `ModalManager.hideConfirmModal()`

**Benefícios:**
- Lógica de modal separada da UI
- Estado centralizado (`loginShown`, `confirmShown`)
- Acessibilidade (focus management)

---

### 6. **state.js** (146 linhas) [REFATORADO]
Gerenciamento de estado da aplicação.

**Contém:**
- Variáveis globais de estado (`currentState`, `savedCredentials`)
- `StateManager` object com métodos para carregar, salvar e limpar
- `updateConnectionState()` - Atualiza UI baseado no estado
- `checkAndShowLogin()` - Detecta quando mostrar login

**Mudanças:**
- Removido gerenciamento de cookies (→ storage.js)
- Removido exibição de modal (→ modals.js)
- Mantém apenas lógica de estado puro

**Benefícios:**
- Responsabilidade única
- Mais testável

---

### 7. **events.js** (236 linhas) [NOVO]
Gerenciamento centralizado de todos os event listeners.

**Módulo: `EventManager`**
- `init()` - Inicializa todos os listeners
- `bindButtonEvents()` - Login, Disconnect, Clear, Send
- `bindInputEvents()` - Comportamento do input
- `bindLoginFormEvents()` - Form de login
- `bindModalEvents()` - Click em modais
- `bindKeyboardEvents()` - Atalhos (Escape, Enter, Y/N)
- Handlers específicos para cada ação

**Benefícios:**
- Todos os listeners em um único lugar
- Fácil adicionar/remover comportamentos
- Lógica de handlers não espalhada

---

### 8. **ui.js** (18 linhas) [REFATORADO]
Helper da interface do usuário.

**Contém:**
- `showConfirmModal(message)` - Wrapper para ModalManager
- `hideConfirmModal()` - Wrapper para ModalManager

**Mudanças:**
- Removido todos os 17+ event listeners (→ events.js)
- Removido lógica de storage (→ storage.js)
- Removido gerenciamento de modal (→ modals.js)
- Apenas wrappers simples para compatibilidade

---

### 9. **ws.js** (180 linhas) [REFATORADO]
Gerenciamento WebSocket.

**Contém:**
- Handlers: `onopen`, `onmessage`, `onerror`, `onclose`
- Message handlers especializados:
  - `handleStateMessage()` - Atualizar estado
  - `handleHistoryMessage()` - Renderizar histórico
  - `handleLineMessage()` - Renderizar linha
  - `handleSystemMessage()` - Mensagem de sistema
- Funções de envio:
  - `sendCommand(text)` - Envia comando (suporta múltiplos com `;`)
  - `sendLogin(username, password)`
  - `getLastCommandSent()`

**Mudanças:**
- Separadas handlers de mensagens em funções
- Removida lógica de prompts (→ prompts.js)
- Removida lógica de UI modal (→ modals.js)
- Mais limpo e fácil de manter

---

## Redução de Tamanho

| Arquivo   | Antes          | Depois          | Redução |
| --------- | -------------- | --------------- | ------- |
| state.js  | 269 linhas     | 146 linhas      | -46%    |
| ui.js     | 197 linhas     | 18 linhas       | -91%    |
| ws.js     | 225 linhas     | 180 linhas      | -20%    |
| **Total** | **691 linhas** | **744 linhas*** | —       |

*Aumento devido aos 5 novos módulos pequenos com headers de documentação. Complexidade geral reduzida significativamente.

## Benefícios da Refatoração

1. **Separação de responsabilidades** - Cada arquivo tem um propósito claro
2. **Testabilidade** - Módulos podem ser testados isoladamente
3. **Reutilização** - StorageManager, PromptDetector, ModalManager podem ser usados em outros contextos
4. **Manutenibilidade** - Mudanças em um sistema não afetam outros
5. **Escalabilidade** - Fácil adicionar novos features
6. **Performance** - Cache de seletores DOM em config.js reduz querySelectors
7. **Documentação** - Cada módulo tem propósito óbvio

## Ordem de Carregamento

```html
<script src="/static/js/logger.js"></script>      <!-- 1. Base de logging -->
<script src="/static/js/config.js"></script>      <!-- 2. Configurações -->
<script src="/static/js/storage.js"></script>     <!-- 3. Storage (sem dependências) -->
<script src="/static/js/prompts.js"></script>     <!-- 4. Detecção de prompts -->
<script src="/static/js/modals.js"></script>      <!-- 5. Modais (usa config) -->
<script src="/static/js/state.js"></script>       <!-- 6. Estado (usa storage) -->
<script src="/static/js/events.js"></script>      <!-- 7. Events (usa state, modals) -->
<script src="/static/js/ui.js"></script>          <!-- 8. UI helpers -->
<script src="/static/js/ws.js"></script>          <!-- 9. WebSocket (usa tudo) -->
```

## Próximas Melhorias Possíveis

1. **Tipos TypeScript** - Adicionar type hints
2. **Testes unitários** - Testar StorageManager, PromptDetector separadamente
3. **Event emitter** - Implementar padrão pub/sub para desacoplar ws.js
4. **Classes ES6** - Converter objetos para classes (ex: ModalManager)
5. **Bundler** - Usar webpack/esbuild para minificação automática
6. **IndexedDB** - Melhor alternativa ao localStorage para dados maiores
