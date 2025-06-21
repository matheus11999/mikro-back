# Configuração do Webhook do Mercado Pago

## 1. Endpoint do Webhook

O webhook está disponível em:
```
POST https://SEU_DOMINIO/api/webhook/mercadopago
GET  https://SEU_DOMINIO/api/webhook/mercadopago
```

## 2. Comandos para Configurar o Webhook

### Criar Webhook (PowerShell)

```powershell
# Substitua YOUR_ACCESS_TOKEN pelo seu token do Mercado Pago
# Substitua SEU_DOMINIO pelo domínio onde sua API está hospedada

$headers = @{
    "Authorization" = "Bearer YOUR_ACCESS_TOKEN"
    "Content-Type" = "application/json"
}

$body = @{
    "url" = "https://SEU_DOMINIO/api/webhook/mercadopago"
    "topics" = @("payment")
} | ConvertTo-Json

# Criar webhook
Invoke-RestMethod -Uri "https://api.mercadopago.com/v1/webhooks" `
    -Method POST `
    -Headers $headers `
    -Body $body
```

### Criar Webhook (Curl - Linux/Mac/Git Bash)

```bash
curl -X POST \
  https://api.mercadopago.com/v1/webhooks \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://SEU_DOMINIO/api/webhook/mercadopago",
    "topics": ["payment"]
  }'
```

### Listar Webhooks Existentes (PowerShell)

```powershell
$headers = @{
    "Authorization" = "Bearer YOUR_ACCESS_TOKEN"
}

Invoke-RestMethod -Uri "https://api.mercadopago.com/v1/webhooks" `
    -Method GET `
    -Headers $headers
```

### Listar Webhooks Existentes (Curl)

```bash
curl -X GET \
  https://api.mercadopago.com/v1/webhooks \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

### Deletar Webhook (PowerShell)

```powershell
# Substitua WEBHOOK_ID pelo ID do webhook que deseja deletar

$headers = @{
    "Authorization" = "Bearer YOUR_ACCESS_TOKEN"
}

Invoke-RestMethod -Uri "https://api.mercadopago.com/v1/webhooks/WEBHOOK_ID" `
    -Method DELETE `
    -Headers $headers
```

### Deletar Webhook (Curl)

```bash
curl -X DELETE \
  https://api.mercadopago.com/v1/webhooks/WEBHOOK_ID \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

## 3. Testar Webhook Localmente

Se você estiver testando localmente, pode usar o ngrok:

```bash
# Instalar ngrok (se ainda não tiver)
# Windows: choco install ngrok
# Mac: brew install ngrok
# Linux: snap install ngrok

# Expor sua API local
ngrok http 3000

# Use a URL HTTPS fornecida pelo ngrok no lugar de SEU_DOMINIO
```

## 4. Exemplo de Resposta ao Criar Webhook

```json
{
  "id": "123456789",
  "url": "https://SEU_DOMINIO/api/webhook/mercadopago",
  "topics": ["payment"],
  "application_id": 987654321,
  "user_id": 456789123,
  "date_created": "2024-01-21T19:00:00.000-04:00",
  "last_update": "2024-01-21T19:00:00.000-04:00"
}
```

## 5. Formato da Notificação do Mercado Pago

O Mercado Pago enviará notificações neste formato:

```json
{
  "id": 12345678900,
  "live_mode": true,
  "type": "payment",
  "date_created": "2024-01-21T19:00:00.000-04:00",
  "user_id": 44444444,
  "api_version": "v1",
  "action": "payment.created",
  "data": {
    "id": "12345678900"
  }
}
```

## 6. Fluxo do Webhook

1. **Mercado Pago envia notificação** → Seu webhook recebe
2. **Webhook responde 200 OK** → Confirma recebimento
3. **Processa assincronamente** → Busca detalhes do pagamento
4. **Se aprovado** → Atribui senha automaticamente
5. **Atualiza banco** → Marca venda como aprovada
6. **Cliente recebe acesso** → Instantaneamente

## 7. Vantagens do Webhook vs Polling

- ✅ **Tempo real**: Notificação instantânea
- ✅ **Eficiência**: Sem requisições desnecessárias
- ✅ **Confiabilidade**: Mercado Pago garante entrega
- ✅ **Escalabilidade**: Suporta alto volume
- ✅ **Economia**: Menos uso de recursos

## 8. Troubleshooting

### Webhook não está recebendo notificações
- Verifique se a URL está acessível publicamente
- Confirme que está retornando 200 OK
- Verifique os logs do servidor

### Pagamentos não são processados
- Verifique se há senhas disponíveis no plano
- Confirme que o payment_id está correto
- Verifique os logs com tag [WEBHOOK MP]

### Mercado Pago está reenviando notificações
- Certifique-se de retornar 200 OK imediatamente
- Não demore mais de 20 segundos para responder
- Process assincronamente após responder

## 9. Segurança

Para adicionar segurança extra, você pode:

1. Validar o IP de origem (IPs do Mercado Pago)
2. Implementar assinatura HMAC
3. Usar HTTPS obrigatoriamente
4. Limitar rate de requisições

## 10. Monitoramento

Recomenda-se monitorar:
- Taxa de sucesso do webhook
- Tempo de processamento
- Erros de processamento
- Senhas disponíveis por plano 