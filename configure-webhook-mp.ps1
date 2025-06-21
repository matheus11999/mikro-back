# Script para configurar Webhook/IPN do Mercado Pago
# Execute no PowerShell

Write-Host "`n=== Configuração de Webhook Mercado Pago ===" -ForegroundColor Cyan
Write-Host "`nComo os endpoints de webhook da API mudaram, recomendamos configurar via Dashboard:" -ForegroundColor Yellow

Write-Host "`n[INSTRUCOES]:" -ForegroundColor Green
Write-Host "1. Acesse: https://www.mercadopago.com.br/developers/panel" -ForegroundColor White
Write-Host "2. Faça login com sua conta" -ForegroundColor White
Write-Host "3. Selecione sua aplicação (ID: 1820948487182968)" -ForegroundColor White
Write-Host "4. No menu lateral, procure por:" -ForegroundColor White
Write-Host "   - 'Webhooks' ou" -ForegroundColor Cyan
Write-Host "   - 'Notificações IPN' ou" -ForegroundColor Cyan
Write-Host "   - 'Notificações' ou" -ForegroundColor Cyan
Write-Host "   - 'Configurações > Notificações'" -ForegroundColor Cyan
Write-Host "5. Configure a URL de notificação:" -ForegroundColor White
Write-Host "   https://api.lucro.top/api/webhook/mercadopago" -ForegroundColor Yellow
Write-Host "6. Selecione os eventos:" -ForegroundColor White
Write-Host "   [X] Pagamentos (Payment)" -ForegroundColor Green
Write-Host "7. Salve as configurações" -ForegroundColor White

Write-Host "`n[ALTERNATIVA] - Teste com cURL direto:" -ForegroundColor Cyan
Write-Host "Se quiser tentar via API, execute este comando:" -ForegroundColor White

$curlCommand = @"
curl -X POST https://api.mercadopago.com/notification_urls `
  -H "Authorization: Bearer APP_USR-1820948487182968-102522-af8be1e6f33c3e9e3f9a9b2b8b0f9e8f-222451579" `
  -H "Content-Type: application/json" `
  -d "{\"url\":\"https://api.lucro.top/api/webhook/mercadopago\",\"events\":[\"payment.created\",\"payment.updated\"]}"
"@

Write-Host $curlCommand -ForegroundColor Gray

Write-Host "`n[TESTE DO WEBHOOK]:" -ForegroundColor Green
Write-Host "Para testar se o webhook está funcionando:" -ForegroundColor White
Write-Host "1. Faça um pagamento PIX de teste" -ForegroundColor White
Write-Host "2. Verifique os logs da API procurando por [WEBHOOK MP]" -ForegroundColor White
Write-Host "3. O pagamento deve ser processado automaticamente" -ForegroundColor White

Write-Host "`n[OBSERVACOES]:" -ForegroundColor Yellow
Write-Host "- O webhook processa pagamentos em tempo real" -ForegroundColor White
Write-Host "- Não precisa mais do sistema de polling" -ForegroundColor White
Write-Host "- Mais eficiente e confiável" -ForegroundColor White
Write-Host "- Suporta alto volume de transações" -ForegroundColor White

Write-Host "`n" -NoNewline
Read-Host "Pressione ENTER para sair" 