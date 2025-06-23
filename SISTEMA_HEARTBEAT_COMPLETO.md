# Sistema de Heartbeat para MikroTiks

## 🎯 Resumo do Sistema

Sistema completo de monitoramento online/offline dos MikroTiks através de heartbeats enviados a cada 5 minutos. O sistema utiliza dados obtidos do comando `/system resource print` para capturar versão e uptime dos equipamentos.

## 🔧 Componentes Implementados

### 1. **API Backend** (`backend/api.cjs`)

#### Endpoint de Heartbeat
```
POST /api/mikrotik/heartbeat
```

**Payload:**
```json
{
  "mikrotik_id": "uuid-do-mikrotik",
  "token": "token-seguro",
  "version": "7.12 (stable)",
  "uptime": "1d12h33m20s"
}
```

#### Endpoint de Status
```
GET /api/mikrotik/status
```

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "nome": "MikroTik Principal",
      "is_online": true,
      "minutos_offline": null,
      "status_conexao": "online",
      "heartbeat_version": "7.12 (stable)",
      "heartbeat_uptime": "1d12h33m20s"
    }
  ],
  "estatisticas": {
    "total": 5,
    "online": 3,
    "offline": 1,
    "nunca_conectou": 1
  }
}
```

### 2. **Script MikroTik** (`backend/mikrotik-heartbeat-monitor.rsc`)

```bash
# Configurações principais
:local apiBaseUrl "https://api.lucro.top"
:local mikrotikId "SEU-MIKROTIK-ID-AQUI"
:local heartbeatToken "MkT_Heartbeat_2024_Secure_Token_H7bQ9wE2rT3yU8iP"

# Executa /system resource print e extrai version e uptime
# Envia heartbeat via HTTP POST
```

**Comandos para configurar no MikroTik:**

1. **Criar o script:**
```bash
/system script add name=heartbeat-monitor source="[COLE-CÓDIGO-COMPLETO]"
```

2. **Configurar scheduler (a cada 5 minutos):**
```bash
/system scheduler add name=heartbeat-auto start-time=startup interval=5m on-event=heartbeat-monitor comment="Heartbeat automatico a cada 5 minutos"
```

3. **Testar manualmente:**
```bash
/system script run heartbeat-monitor
```

4. **Verificar logs:**
```bash
/log print where topics~"script"
```

### 3. **Migração do Banco de Dados** (`backend/MIGRATION_HEARTBEAT_MIKROTIKS.sql`)

#### Novos Campos na Tabela `mikrotiks`:
- `ultimo_heartbeat` (TIMESTAMPTZ) - Timestamp do último heartbeat
- `heartbeat_version` (TEXT) - Versão do RouterOS
- `heartbeat_uptime` (TEXT) - Uptime do equipamento

#### View Criada:
```sql
vw_mikrotiks_status
```
- Calcula automaticamente status online/offline
- Considera offline se > 15 minutos sem heartbeat
- Inclui dados do cliente vinculado

#### Funções Criadas:
- `verificar_status_mikrotik(mikrotik_id)` - Status individual
- `estatisticas_status_mikrotiks()` - Estatísticas gerais

### 4. **Frontend React**

#### Hook Personalizado (`frontend/src/hooks/useMikrotikStatus.ts`)
```typescript
const { mikrotiks, estatisticas, loading, error, refresh } = useMikrotikStatus();
```

#### Componente de Badge (`frontend/src/components/MikrotikStatusBadge.tsx`)
```typescript
<MikrotikStatusBadge
  isOnline={true}
  minutosOffline={null}
  ultimoHeartbeat="2024-01-01T10:00:00Z"
  version="7.12 (stable)"
  uptime="1d12h33m20s"
  size="sm"
/>
```

#### Integração nos Dashboards:
- **AdminDashboard**: Resumo geral de todos os MikroTiks
- **MikrotiksManagement**: Status individual em cada linha da tabela
- **ClientDashboard**: Status dos MikroTiks do cliente

## 📊 Regras de Negócio

### Status Online/Offline
- **Online**: Heartbeat recebido nos últimos 15 minutos
- **Offline**: Último heartbeat há mais de 15 minutos
- **Nunca Conectou**: Nenhum heartbeat registrado

### Dados Capturados
- **Version**: Obtida via `/system resource print` (ex: "7.12 (stable)")
- **Uptime**: Tempo ativo do equipamento (ex: "1d12h33m20s")
- **Timestamp**: Data/hora automática do heartbeat

### Atualização Automática
- **MikroTik**: Envia heartbeat a cada 5 minutos
- **Frontend**: Atualiza status a cada 30 segundos
- **Tolerância**: 15 minutos para considerar offline

## 🚀 Como Configurar

### 1. Executar Migração
```sql
-- No SQL Editor do Supabase
-- Cole todo o conteúdo de MIGRATION_HEARTBEAT_MIKROTIKS.sql
```

### 2. Configurar MikroTik
```bash
# 1. Edite o arquivo mikrotik-heartbeat-monitor.rsc
# 2. Substitua "SEU-MIKROTIK-ID-AQUI" pelo ID real
# 3. Ajuste a URL da API se necessário
# 4. Cole o script no MikroTik
# 5. Configure o scheduler
```

### 3. Obter ID do MikroTik
```sql
-- No Supabase SQL Editor
SELECT id, nome FROM mikrotiks ORDER BY nome;
```

### 4. Testar Sistema
1. Execute o script manualmente no MikroTik
2. Verifique os logs: `/log print where topics~"script"`
3. Confirme no dashboard se aparece como "Online"

## 🔍 Monitoramento e Debug

### Logs do MikroTik
```bash
/log print where topics~"script"
# Procure por "[HEARTBEAT]" nas mensagens
```

### Logs da API
```bash
# No servidor, procure por:
[HEARTBEAT] Recebido heartbeat: {...}
[HEARTBEAT] Heartbeat registrado com sucesso
```

### Verificar Status no Banco
```sql
-- Consultar status atual
SELECT nome, ultimo_heartbeat, heartbeat_version, heartbeat_uptime, 
       is_online, status_conexao 
FROM vw_mikrotiks_status;

-- Estatísticas gerais
SELECT * FROM estatisticas_status_mikrotiks();
```

## ⚠️ Solução de Problemas

### MikroTik não aparece como Online
1. Verifique se o script está rodando: `/system scheduler print`
2. Confirme o ID do MikroTik no script
3. Teste conectividade: `/tool fetch url=https://api.lucro.top/api/captive-check`
4. Verifique logs de erro no script

### Frontend não mostra status
1. Confirme se a view `vw_mikrotiks_status` existe
2. Verifique console do navegador para erros
3. Teste endpoint: `GET /api/mikrotik/status`

### Heartbeat falha
1. Verifique token de autenticação
2. Confirme URL da API no script
3. Teste manualmente: `/system script run heartbeat-monitor`

## 📈 Próximas Melhorias

### Implementadas
- ✅ Endpoint de heartbeat
- ✅ Script MikroTik automatizado
- ✅ Frontend com status visual
- ✅ Migração completa do banco
- ✅ Hooks React personalizados
- ✅ Componentes reutilizáveis

### Possíveis Extensões
- 🔄 Alertas por email/webhook quando offline
- 📊 Histórico de uptime/downtime
- 🎯 Dashboard dedicado de monitoramento
- 📱 Notificações push
- 🔧 Auto-restart de serviços offline

## 🎉 Benefícios Alcançados

1. **Monitoramento em Tempo Real**: Status online/offline atualizado automaticamente
2. **Informações Técnicas**: Versão RouterOS e uptime visíveis
3. **Interface Intuitiva**: Badges visuais com cores e ícones
4. **Histórico Auditável**: Todos os heartbeats são registrados
5. **Performance Otimizada**: View SQL eficiente para consultas
6. **Escalabilidade**: Sistema preparado para centenas de MikroTiks

---

**✨ Sistema de Heartbeat implementado com sucesso! Agora você tem visibilidade completa sobre o status dos seus MikroTiks em tempo real.** 