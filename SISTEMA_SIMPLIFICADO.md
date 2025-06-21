# Sistema PIX Mikrotik Simplificado - Sem Senhas

## 📋 Resumo das Mudanças

### ✅ O que foi Modificado

1. **API Simplificada (`api.cjs`)**:
   - ❌ Removido sistema completo de senhas
   - ✅ Adicionada autenticação por token em **todos** os endpoints protegidos
   - ✅ Rota `/api/recent-sales/:mikrotik_id` agora retorna apenas `mac` e `minutos`
   - ✅ Mantido endpoint de autenticação Mikrotik para controle de status

2. **Scripts Mikrotik Atualizados**:
   - ✅ `mikrotik-script-SIMPLIFICADO.rsc` - Script principal
   - ✅ `mikrotik-cleanup-SIMPLIFICADO.rsc` - Script de limpeza
   - ❌ Removida lógica de usuários/senhas
   - ✅ Trabalha apenas com IP bindings (bypass)

## 🔧 Configuração Necessária

### Variáveis de Ambiente (EasyPanel)

```bash
# Token para API geral (endpoints protegidos)
API_ACCESS_TOKEN=api-secure-token-2024

# Token para notificações do Mikrotik
MIKROTIK_AUTH_TOKEN=mikrotik-secure-token-2024

# Supabase (já existentes)
SUPABASE_URL=sua_url_supabase
SUPABASE_SERVICE_ROLE_KEY=sua_service_key
```

### Configuração dos Scripts Mikrotik

Nos scripts, ajustar as variáveis:

```routeros
:local apiBaseUrl "https://api.lucro.top"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "mikrotik-secure-token-2024"
:local apiToken "api-secure-token-2024"
```

## 🔄 Como Funciona o Novo Sistema

### 1. Fluxo de Compra PIX (Inalterado)
- Cliente acessa portal captivo
- Faz pagamento PIX via Mercado Pago
- Pagamento aprovado → cria registro na tabela `vendas`

### 2. Processamento Mikrotik (Simplificado)

#### Script Principal (`mikrotik-script-SIMPLIFICADO.rsc`)
1. **Consulta API**: `GET /api/recent-sales/:mikrotik_id?token=xxx`
2. **Resposta**: `[{"mac": "aa:bb:cc:dd:ee:ff", "minutos": 60}]`
3. **Processa**: Cria IP binding direto (bypassed)
4. **Notifica**: `POST /api/mikrotik/auth-notification` (action: "connect")
5. **Agenda**: Scheduler para remoção automática

#### Script de Limpeza (`mikrotik-cleanup-SIMPLIFICADO.rsc`)
1. **Verifica**: Bindings com schedulers expirados
2. **Remove**: Bindings e schedulers vencidos
3. **Notifica**: API sobre desconexões (action: "disconnect")

## 📊 Endpoints da API

### Públicos
- `GET /api/captive-check` - Teste de conectividade

### Protegidos (Requerem Token)
- `GET /api/recent-sales/:mikrotik_id` - Vendas recentes (2 min)
- `GET /api/stats/:mikrotik_id` - Estatísticas do mikrotik

### Mikrotik (Token Específico)
- `POST /api/mikrotik/auth-notification` - Notificações de status

## 🔒 Autenticação

### Para Endpoints Protegidos
```bash
# Via Header
Authorization: Bearer api-secure-token-2024

# Via Query
GET /api/stats/123?token=api-secure-token-2024

# Via Body
POST /api/endpoint
{
  "token": "api-secure-token-2024",
  "data": "..."
}
```

### Para Mikrotik
```json
{
  "token": "mikrotik-secure-token-2024",
  "mac_address": "aa:bb:cc:dd:ee:ff",
  "mikrotik_id": "78957cd3-7096-4acd-970b-0aa0a768c555",
  "action": "connect|disconnect"
}
```

## 🎯 Benefícios do Sistema Simplificado

### ✅ Vantagens
- **Mais Simples**: Sem complexidade de usuários/senhas
- **Mais Rápido**: Bypass direto por MAC
- **Mais Seguro**: Tokens em todos endpoints
- **Menos Erros**: Menos pontos de falha
- **Fácil Debug**: Logs mais limpos

### ⚠️ Considerações
- **Sem Controle por Usuário**: Apenas por MAC
- **Bypass Total**: Acesso irrestrito durante período
- **Dependente de MAC**: Cliente não pode trocar dispositivo

## 🚀 Instalação/Atualização

### 1. Backup
```bash
cd backend
cp api.cjs api-backup-$(date +%Y%m%d).cjs
```

### 2. Aplicar Nova API
```bash
# Já foi aplicada automaticamente
# api.cjs agora é a versão simplificada
```

### 3. Configurar Variáveis
```bash
# No EasyPanel, adicionar:
API_ACCESS_TOKEN=api-secure-token-2024
MIKROTIK_AUTH_TOKEN=mikrotik-secure-token-2024
```

### 4. Atualizar Scripts Mikrotik
- Upload `mikrotik-script-SIMPLIFICADO.rsc`
- Upload `mikrotik-cleanup-SIMPLIFICADO.rsc`
- Configurar schedulers conforme necessário

### 5. Testar Sistema
```bash
# Teste da API
curl -H "Authorization: Bearer api-secure-token-2024" \
  https://api.lucro.top/api/recent-sales/78957cd3-7096-4acd-970b-0aa0a768c555

# Teste de notificação
curl -X POST https://api.lucro.top/api/mikrotik/auth-notification \
  -H "Content-Type: application/json" \
  -d '{
    "token": "mikrotik-secure-token-2024",
    "mac_address": "aa:bb:cc:dd:ee:ff",
    "mikrotik_id": "78957cd3-7096-4acd-970b-0aa0a768c555",
    "action": "connect"
  }'
```

## 📝 Logs e Debug

### API Logs
```bash
# Verificar logs no EasyPanel
[PIX-SCRIPT] === INICIANDO SCRIPT SIMPLIFICADO ===
[PIX-SCRIPT] Consultando vendas recentes da API...
[PIX-SCRIPT] Encontrado: MAC aa:bb:cc:dd:ee:ff com 60 minutos
[PIX-SCRIPT] IP Binding criado para aa:bb:cc:dd:ee:ff
```

### Mikrotik Logs
```routeros
# Ver logs
/log print where topics~"info"

# Verificar bindings ativos
/ip hotspot ip-binding print where comment~"PIX-AUTO-"

# Verificar schedulers
/system scheduler print where comment~"AUTO-REMOVE-"
```

## 🔄 Migração de Dados

O sistema simplificado **mantém compatibilidade** com:
- ✅ Tabela `vendas` (usando `mac_cliente` e `minutos_acesso`)
- ✅ Tabela `macs` (para controle de status)
- ❌ Tabela `senhas` (não é mais utilizada)

Não é necessária migração de dados - o sistema funciona com os dados existentes.

---

**Data da Implementação**: $(date)  
**Versão**: Sistema Simplificado v1.0  
**Status**: ✅ Pronto para produção 