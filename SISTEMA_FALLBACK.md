# Sistema PIX com Fallback de Notificações

## O Problema

Os scripts originais funcionavam corretamente (processamento de vendas e limpeza automática), mas as notificações para a API falhavam ocasionalmente.

## A Solução: Sistema de Fallback

Criamos scripts com sistema robusto de fallback que tenta **4 métodos diferentes** para notificar a API:

### 🔄 Estratégia de Fallback

**Tentativa 1**: POST JSON normal (método original)
- `Content-Type: application/json`
- Timeout padrão
- Delay: 2s

**Tentativa 2**: POST JSON com timeout maior
- Mesmo payload, mas `timeout=10`
- Delay: 3s

**Tentativa 3**: GET com parâmetros na URL
- `?token=...&mac_address=...&mikrotik_id=...&action=...`
- `timeout=15`
- Delay: 3s

**Tentativa 4**: POST simples sem headers específicos
- Sem `Content-Type` explícito
- `timeout=20`
- Delay: 4s

## 📁 Scripts Criados

### 1. `mikrotik-principal-fallback.rsc`
- Script principal **com fallback**
- Processa vendas e cria IP bindings
- Tenta notificar "connect" com 4 métodos
- Sistema continua funcionando mesmo se notificações falharem

### 2. `mikrotik-limpeza-fallback.rsc`  
- Script de limpeza **com fallback**
- Remove bindings expirados
- Tenta notificar "disconnect" com 4 métodos
- Mostra estatísticas de notificações (sucessos/falhas)

### 3. `mikrotik-schedulers-fallback.rsc`
- Configura schedulers para usar scripts com fallback
- `pix-processar-vendas-fallback`: a cada 2 min
- `pix-limpeza-fallback`: a cada 10 min

### 4. `mikrotik-teste-fallback.rsc`
- Testa todas as 4 tentativas de notificação
- Mostra qual método funcionou
- Validação completa do sistema

## 🚀 Como Usar

### Passo 1: Testar o Fallback
```bash
# Execute o teste primeiro
/system script run mikrotik-teste-fallback

# Verifique os resultados nos logs
/log print where topics~"script"
```

### Passo 2: Configurar Schedulers (se teste passou)
```bash
# Configure os schedulers com fallback
/system script run mikrotik-schedulers-fallback

# Verifique se foram criados
/system scheduler print
```

### Passo 3: Monitorar
```bash
# Acompanhe os logs para ver qual método está funcionando
/log print where topics~"script" and message~"Tentativa"
```

## 📊 Entendendo os Logs

### ✅ Sucesso
```
✓ API notificada (tentativa 1): connect para E2:26:89:13:AD:71
✓ Notificacao de connect bem-sucedida
```

### ⚠️ Fallback Funcionando
```
✗ Tentativa 1 falhou: connect para E2:26:89:13:AD:71
✗ Tentativa 2 falhou: connect para E2:26:89:13:AD:71
✓ API notificada (tentativa 3 GET): connect para E2:26:89:13:AD:71
✓ Notificacao de connect bem-sucedida
```

### ❌ Falha Total
```
✗ Tentativa 1 falhou: connect para E2:26:89:13:AD:71
✗ Tentativa 2 falhou: connect para E2:26:89:13:AD:71
✗ Tentativa 3 GET falhou: connect para E2:26:89:13:AD:71
✗ Tentativa 4 simples falhou: connect para E2:26:89:13:AD:71
✗ TODAS as tentativas de notificacao falharam para connect/E2:26:89:13:AD:71
✗ Binding criado mas API nao foi notificada
```

## 🎯 Vantagens

1. **Sistema Robusto**: 4 tentativas com métodos diferentes
2. **Continua Funcionando**: Bindings são criados/removidos mesmo se API falhar
3. **Diagnóstico Claro**: Logs mostram exatamente qual método funcionou
4. **Timeouts Progressivos**: Evita travamentos
5. **Estatísticas**: Mostra quantas notificações falharam vs. sucessos

## 🔧 Configurações

**URLs**:
- Vendas: `https://api.lucro.top/api/recent-sales/78957cd3-7096-4acd-970b-0aa0a768c555`
- Notificações: `https://api.lucro.top/api/mikrotik/auth-notification`

**Token**: `MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3`

**Schedulers**:
- Vendas: a cada 2 minutos
- Limpeza: a cada 10 minutos

## 🆚 Comparação

| Aspecto | Versão Original | Versão Fallback |
|---------|----------------|-----------------|
| Notificações | 1 tentativa | 4 tentativas |
| Métodos HTTP | POST JSON | POST, GET, POST simples |
| Timeouts | Padrão | 3s, 10s, 15s, 20s |
| Resiliência | Baixa | Alta |
| Diagnóstico | Básico | Detalhado |
| Funcionamento | Para se API falhar | Continua sempre |

## 🔍 Troubleshooting

### Se o teste falhar completamente:
1. Verificar conectividade: `ping api.lucro.top`
2. Verificar DNS: `/ip dns print`
3. Verificar token e URLs
4. Testar manualmente: `/tool fetch url=https://api.lucro.top`

### Se apenas algumas tentativas falharem:
- Sistema está funcionando parcialmente
- Monitorar qual método está funcionando
- API pode estar com problemas intermitentes

### Se notificações falharem mas sistema funcionar:
- Bindings são criados/removidos corretamente
- Usuários conseguem acessar internet
- API apenas não recebe status updates (não crítico)

O sistema com fallback garante máxima robustez e continuidade do serviço! 