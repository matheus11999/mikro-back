# Configuração de Variáveis de Ambiente - EasyPanel

## 📋 Variáveis Obrigatórias

Para que o sistema funcione corretamente, você precisa configurar as seguintes variáveis de ambiente no EasyPanel:

### 🗄️ Supabase
```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_aqui
```

### 💳 Mercado Pago
```env
MERCADO_PAGO_ACCESS_TOKEN=seu_access_token_do_mercado_pago
```

### 🕐 Timezone (Opcional)
```env
TIMEZONE=America/Sao_Paulo
```

## 🚀 Como Configurar no EasyPanel

1. **Acesse seu projeto** no EasyPanel
2. **Vá para a seção "Environment"** ou "Variáveis de Ambiente"
3. **Adicione cada variável** uma por vez:
   - **Nome**: `SUPABASE_URL`
   - **Valor**: `https://seu-projeto.supabase.co`
   - Clique em **Adicionar**

4. **Repita o processo** para todas as variáveis listadas acima

## 🔍 Verificação Automática de Pagamentos

O sistema agora inclui verificação automática de pagamentos pendentes que:

- ✅ **Executa no startup** do servidor
- 🕐 **Verifica pagamentos** das últimas **4 horas**
- 🔄 **Consulta o Mercado Pago** para verificar mudanças de status
- 💰 **Processa automaticamente** pagamentos que foram aprovados
- 📊 **Exibe relatório completo** no console

### 📋 Status Verificados:
- `pendente` - Pagamento aguardando processamento
- `processando` - Pagamento em processamento
- `autorizado` - Pagamento autorizado (aguardando captura)
- `criado` - Pagamento recém criado

### 🎯 Ações Automáticas:
- **Pagamentos Aprovados**: Credita saldos automaticamente
- **Pagamentos Rejeitados**: Marca como rejeitado
- **Pagamentos Cancelados**: Marca como cancelado
- **Pagamentos Expirados**: Marca como expirado

## 🛡️ Segurança

- O sistema **verifica automaticamente** se as variáveis estão configuradas
- Se alguma variável estiver **faltando**, a verificação é **pulada** sem causar erro
- **Logs detalhados** mostram exatamente o que está acontecendo

## 📊 Logs de Exemplo

```
🔍 VERIFICANDO PAGAMENTOS PENDENTES NO STARTUP...
============================================================
📅 Buscando vendas pendentes desde: 2025-06-23T16:47:05.123Z
📊 Encontradas 3 vendas pendentes para verificar
============================================================

🔄 Verificando payment_id: 116128336686 (Status atual: pendente)
   📡 Status no MP: approved (accredited)
   🔄 Status mudou de "pendente" para "approved" - processando...
   ✅ APROVANDO pagamento 116128336686...
   💰 Saldos creditados - Admin: R$ 0.30, Cliente: R$ 2.70
   ✅ Venda atualizada com sucesso!

============================================================
📊 RESUMO DA VERIFICAÇÃO:
   🔄 Total verificadas: 3
   ✅ Processadas: 1
   💚 Aprovadas: 1
   ❌ Rejeitadas: 0
   📝 Outros status: 0
============================================================
```

## ⚠️ Troubleshooting

### Erro: "Invalid API key"
- Verifique se `SUPABASE_SERVICE_ROLE_KEY` está correto
- Certifique-se de usar a **Service Role Key**, não a **Anon Key**

### Erro: "Token do Mercado Pago não configurado"
- Verifique se `MERCADO_PAGO_ACCESS_TOKEN` está configurado
- Use o token de **produção** ou **sandbox** conforme necessário

### Erro: "column vendas.created_at does not exist"
- Este erro foi corrigido na versão atual
- Certifique-se de estar usando a versão mais recente do código 