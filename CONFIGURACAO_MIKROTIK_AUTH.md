# Configuração de Autenticação Mikrotik

## Resumo das Mudanças

Foi implementada uma nova rota na API para receber notificações de autenticação do Mikrotik:

- **Rota**: `POST /api/mikrotik/auth-notification`
- **Função**: Atualiza o status do MAC como "conectado" ou "desconectado" no Supabase
- **Segurança**: Usa token de autenticação

## 1. Configuração do Servidor (.env)

Adicione esta variável no seu arquivo `.env`:

```env
# Token de segurança para notificações do Mikrotik
MIKROTIK_AUTH_TOKEN=mikrotik-secure-token-2024
```

**⚠️ IMPORTANTE**: Troque `mikrotik-secure-token-2024` por um token único e seguro!

## 2. Script Atualizado do Mikrotik

Use o script `mikrotik-script-updated.rsc` que inclui:

### Principais mudanças:
1. **Nova URL**: `https://api.lucro.top/api/mikrotik/auth-notification`
2. **Token de segurança**: Configurado na variável `:local authToken`
3. **Notificação de conexão**: Quando IP binding é criado
4. **Notificação de desconexão**: Quando o tempo expira

### Configuração no Mikrotik:

```rsc
:local authToken "mikrotik-secure-token-2024"  # DEVE SER O MESMO DO .env
```

## 3. Como funciona agora

### Fluxo de autenticação:
1. Script busca vendas recentes da API
2. Cria IP binding para MACs com vendas aprovadas
3. **NOVIDADE**: Envia notificação `"action": "connect"` para a API
4. API atualiza status do MAC para "conectado"
5. Quando expira, envia notificação `"action": "disconnect"`
6. API atualiza status do MAC para "desconectado"

### Payload enviado para a API:
```json
{
  "token": "mikrotik-secure-token-2024",
  "mac_address": "00:11:22:33:44:55",
  "mikrotik_id": "78957cd3-7096-4acd-970b-0aa0a768c555",
  "action": "connect",  // ou "disconnect"
  "usuario": "user123",
  "ip_address": "",
  "duration": 60
}
```

## 4. Campos atualizados no Supabase

A API atualiza na tabela `macs`:
- `status`: "conectado" ou "desconectado"
- `ultimo_acesso`: timestamp atual
- `ultimo_usuario_mikrotik`: usuário que se conectou
- `ultimo_ip`: IP do cliente (se fornecido)

## 5. Log de auditoria (opcional)

A API tenta criar registros na tabela `logs_autenticacao` com:
- `mac_id`, `mac_address`, `mikrotik_id`
- `action`, `usuario_mikrotik`, `ip_address`
- `timestamp`, `status_anterior`, `status_novo`

**Nota**: Se a tabela não existir, a operação continua normalmente.

## 6. Como testar

### Teste manual da API:
```bash
curl -X POST https://api.lucro.top/api/mikrotik/auth-notification \
  -H "Content-Type: application/json" \
  -d '{
    "token": "mikrotik-secure-token-2024",
    "mac_address": "00:11:22:33:44:55",
    "mikrotik_id": "78957cd3-7096-4acd-970b-0aa0a768c555",
    "action": "connect",
    "usuario": "test123"
  }'
```

### Verificar se está funcionando:
```bash
curl https://api.lucro.top/api/mikrotik/auth-notification/test
```

## 7. Segurança

- ✅ Token obrigatório em todas as requisições
- ✅ Validação de MAC address
- ✅ Validação de campos obrigatórios
- ✅ Logs detalhados de todas as operações
- ✅ Tratamento de erros robusto

## 8. Troubleshooting

### Se der erro 401 (Unauthorized):
- Verifique se o token no script Mikrotik é igual ao do `.env`
- Verifique se a variável `MIKROTIK_AUTH_TOKEN` está definida no servidor

### Se não estiver atualizando o status:
- Verifique os logs do Mikrotik: `/log print where message~"API"`
- Verifique os logs da API no servidor
- Teste a rota manualmente com curl

### Para ver os logs em tempo real:
No Mikrotik: `/log print follow where message~"API"` 