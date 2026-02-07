# Sistema de Sessões Multi-Usuário

## O que mudou?

Refatoração completa para suportar **múltiplas sessões independentes** ao invés de uma sessão global compartilhada.

### Problema Original
Todos os clientes (celular, laptop, etc.) compartilhavam a **mesma sessão** do MUD porque o código usava variáveis globais.

### Solução Implementada

#### 1. **Arquitetura de Sessões**
Cada conexão agora tem sua própria sessão isolada:
- Cada WebSocket → Sessão única → Socket TCP único para o MUD
- Histórico, buffer e estado são isolados por sessão

#### 2. **Sistema de Tokens (SessionID)**
- Cliente gera um UUID único salvo no `localStorage`
- Token válido por **10 minutos** após última interação
- Ao recarregar a página, o token é reutilizado para recuperar a sessão existente
- Sessões sem clientes e inativas por > 10 min são removidas automaticamente

#### 3. **Estrutura Modular**

```
app/
  sessions/
    __init__.py       # Exporta classes principais
    storage.py        # Interface abstrata para armazenamento
                      # (pronto para trocar memória por banco de dados)
    session.py        # Classe MudSession (uma sessão individual)
    manager.py        # SessionManager (gerencia múltiplas sessões)
```

**Interface de Storage:**
- `SessionStorage` (abstrata) - define o contrato
- `MemorySessionStorage` - implementação atual em memória
- Futuro: `DatabaseSessionStorage` - basta implementar a interface

#### 4. **Fluxo de Conexão**

**Frontend:**
1. Gera ou recupera `sessionId` do localStorage
2. Abre WebSocket
3. Envia `{type: "init", sessionId: "uuid"}`
4. Aguarda `{type: "init_ok"}`
5. Continua com `connect`, `login`, `command`

**Backend:**
1. Aceita WebSocket
2. Aguarda mensagem `init`
3. Obtém ou cria `MudSession` para o `sessionId`
4. Adiciona WebSocket à lista de clientes da sessão
5. Envia histórico e estado da sessão
6. Todas as ações funcionam isoladas por sessão

#### 5. **Limpeza Automática**
- Task assíncrona roda a cada **1 minuto**
- Remove sessões sem clientes há mais de **10 minutos**
- Desconecta do MUD graciosamente antes de remover

## Como testar?

1. **Abra em dois navegadores diferentes** (ou um normal + um privado)
2. Conecte no MUD em ambos
3. Faça login com **usuários diferentes** (ou mesmo usuário, se quiser múltiplas sessões)
4. Cada um terá seu **próprio jogo independente**! 🎉

## Teste de Recuperação de Sessão

1. Conecte no MUD e faça login
2. **Recarregue a página** (F5)
3. A sessão será **restaurada automaticamente** com o histórico!

## Teste de Timeout

1. Conecte no MUD
2. Feche todas as abas
3. Aguarde **10 minutos**
4. Sessão será removida automaticamente
5. Ao abrir novamente, criará uma **nova sessão limpa**

## Arquivos Modificados

### Backend (Python)
- `app/main.py` - Inicia/para task de cleanup
- `app/ws.py` - Refatorado para usar sessões ao invés de globais
- `app/sessions/` - Novo módulo completo de sessões

### Frontend (JavaScript)
- `static/js/config.js` - Adicionada chave `SESSION_ID`
- `static/js/storage.js` - Funções para gerenciar sessionId
- `static/js/ws.js` - Envia `init` com sessionId ao conectar

## Próximos Passos (Futuro)

### Para adicionar banco de dados:

1. Criar `DatabaseSessionStorage`:
```python
class DatabaseSessionStorage(SessionStorage):
    def get_session(self, session_id: str):
        # SELECT * FROM sessions WHERE id = session_id
        pass
    
    def save_session(self, session_id: str, data: Dict):
        # INSERT/UPDATE sessions
        pass
```

2. No `main.py`:
```python
# Era:
session_manager = SessionManager()

# Fica:
storage = DatabaseSessionStorage(db_connection)
session_manager = SessionManager(storage=storage)
```

3. Pronto! Todo o resto continua funcionando.

## Vantagens

✅ Múltiplas sessões independentes  
✅ Recuperação de sessão ao recarregar  
✅ Limpeza automática de sessões inativas  
✅ Código modular e testável  
✅ Fácil trocar storage (memória → banco)  
✅ Cada sessão tem seu próprio histórico  
✅ Timeout configurável (10 min padrão)

## Configurações

Em `app/sessions/manager.py`:
```python
SessionManager(
    storage=None,  # None = memória, ou DatabaseStorage()
    session_timeout_minutes=10  # Altere aqui o timeout
)
```
