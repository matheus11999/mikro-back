# Script PowerShell para configurar Webhook do Mercado Pago
# Execute este script no PowerShell como administrador

# CONFIGURAÇÕES - ALTERE ESTAS VARIÁVEIS
$ACCESS_TOKEN = "SEU_ACCESS_TOKEN_AQUI"
$WEBHOOK_URL = "https://SEU_DOMINIO/api/webhook/mercadopago"

# Cores para output
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

Write-Host "`n=== Configurador de Webhook Mercado Pago ===" -ForegroundColor Cyan

# Verificar se as variáveis foram configuradas
if ($ACCESS_TOKEN -eq "SEU_ACCESS_TOKEN_AQUI" -or $WEBHOOK_URL -eq "https://SEU_DOMINIO/api/webhook/mercadopago") {
    Write-Host "`nERRO: Configure as variáveis ACCESS_TOKEN e WEBHOOK_URL antes de executar!" -ForegroundColor Red
    Write-Host "Edite este arquivo e substitua:" -ForegroundColor Yellow
    Write-Host "  - SEU_ACCESS_TOKEN_AQUI pelo seu token do Mercado Pago" -ForegroundColor Yellow
    Write-Host "  - SEU_DOMINIO pelo domínio onde sua API está hospedada" -ForegroundColor Yellow
    exit 1
}

# Headers para as requisições
$headers = @{
    "Authorization" = "Bearer $ACCESS_TOKEN"
    "Content-Type" = "application/json"
}

# Função para listar webhooks existentes
function List-Webhooks {
    Write-Host "`n📋 Listando webhooks existentes..." -ForegroundColor Yellow
    
    try {
        $response = Invoke-RestMethod -Uri "https://api.mercadopago.com/v1/webhooks" `
            -Method GET `
            -Headers @{"Authorization" = "Bearer $ACCESS_TOKEN"}
        
        if ($response) {
            Write-Host "`nWebhooks encontrados:" -ForegroundColor Green
            $response | ForEach-Object {
                Write-Host "  ID: $($_.id)" -ForegroundColor Cyan
                Write-Host "  URL: $($_.url)"
                Write-Host "  Topics: $($_.topics -join ', ')"
                Write-Host "  Criado em: $($_.date_created)"
                Write-Host "  ---"
            }
            return $response
        } else {
            Write-Host "Nenhum webhook encontrado." -ForegroundColor Gray
            return @()
        }
    } catch {
        Write-Host "Erro ao listar webhooks: $_" -ForegroundColor Red
        return @()
    }
}

# Função para deletar webhook
function Remove-Webhook($webhookId) {
    Write-Host "`n🗑️  Deletando webhook $webhookId..." -ForegroundColor Yellow
    
    try {
        Invoke-RestMethod -Uri "https://api.mercadopago.com/v1/webhooks/$webhookId" `
            -Method DELETE `
            -Headers @{"Authorization" = "Bearer $ACCESS_TOKEN"}
        
        Write-Host "Webhook deletado com sucesso!" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "Erro ao deletar webhook: $_" -ForegroundColor Red
        return $false
    }
}

# Função para criar webhook
function New-Webhook {
    Write-Host "`n🔧 Criando novo webhook..." -ForegroundColor Yellow
    Write-Host "URL: $WEBHOOK_URL" -ForegroundColor Cyan
    
    $body = @{
        "url" = $WEBHOOK_URL
        "topics" = @("payment")
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "https://api.mercadopago.com/v1/webhooks" `
            -Method POST `
            -Headers $headers `
            -Body $body
        
        Write-Host "`n✅ Webhook criado com sucesso!" -ForegroundColor Green
        Write-Host "ID: $($response.id)" -ForegroundColor Cyan
        Write-Host "URL: $($response.url)"
        Write-Host "Topics: $($response.topics -join ', ')"
        
        return $response
    } catch {
        Write-Host "`n❌ Erro ao criar webhook: $_" -ForegroundColor Red
        
        # Tentar extrair mensagem de erro detalhada
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $reader.BaseStream.Position = 0
            $reader.DiscardBufferedData()
            $responseBody = $reader.ReadToEnd()
            Write-Host "Detalhes: $responseBody" -ForegroundColor Red
        }
        
        return $null
    }
}

# Função para testar webhook
function Test-Webhook {
    Write-Host "`n🧪 Testando webhook..." -ForegroundColor Yellow
    Write-Host "Fazendo requisição GET para: $WEBHOOK_URL" -ForegroundColor Cyan
    
    try {
        $response = Invoke-WebRequest -Uri $WEBHOOK_URL -Method GET
        
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Webhook está respondendo corretamente!" -ForegroundColor Green
            Write-Host "Resposta: $($response.Content)" -ForegroundColor Gray
            return $true
        } else {
            Write-Host "⚠️  Webhook retornou status: $($response.StatusCode)" -ForegroundColor Yellow
            return $false
        }
    } catch {
        Write-Host "❌ Erro ao testar webhook: $_" -ForegroundColor Red
        Write-Host "Certifique-se que a URL está acessível publicamente!" -ForegroundColor Yellow
        return $false
    }
}

# Menu principal
function Show-Menu {
    Write-Host "`n=== MENU ===" -ForegroundColor Cyan
    Write-Host "1. Listar webhooks existentes"
    Write-Host "2. Criar novo webhook"
    Write-Host "3. Deletar webhook existente"
    Write-Host "4. Testar URL do webhook"
    Write-Host "5. Setup completo (deletar existentes e criar novo)"
    Write-Host "0. Sair"
    Write-Host ""
}

# Loop principal
$continue = $true
while ($continue) {
    Show-Menu
    $choice = Read-Host "Escolha uma opção"
    
    switch ($choice) {
        "1" {
            List-Webhooks | Out-Null
        }
        "2" {
            New-Webhook | Out-Null
        }
        "3" {
            $webhooks = List-Webhooks
            if ($webhooks.Count -gt 0) {
                $webhookId = Read-Host "`nDigite o ID do webhook para deletar"
                Remove-Webhook $webhookId | Out-Null
            }
        }
        "4" {
            Test-Webhook | Out-Null
        }
        "5" {
            Write-Host "`n🚀 Executando setup completo..." -ForegroundColor Cyan
            
            # Testar URL primeiro
            $testResult = Test-Webhook
            if (-not $testResult) {
                $confirm = Read-Host "`nA URL do webhook não está acessível. Deseja continuar mesmo assim? (S/N)"
                if ($confirm -ne "S" -and $confirm -ne "s") {
                    Write-Host "Setup cancelado." -ForegroundColor Yellow
                    continue
                }
            }
            
            # Deletar webhooks existentes
            $webhooks = List-Webhooks
            foreach ($webhook in $webhooks) {
                Remove-Webhook $webhook.id | Out-Null
            }
            
            # Criar novo webhook
            $newWebhook = New-Webhook
            
            if ($newWebhook) {
                Write-Host "`n✅ Setup completo!" -ForegroundColor Green
                Write-Host "`nPróximos passos:" -ForegroundColor Yellow
                Write-Host "1. Certifique-se que sua API está rodando em: $WEBHOOK_URL"
                Write-Host "2. Faça um pagamento de teste"
                Write-Host "3. Verifique os logs da API procurando por [WEBHOOK MP]"
            }
        }
        "0" {
            $continue = $false
            Write-Host "`nSaindo..." -ForegroundColor Gray
        }
        default {
            Write-Host "`nOpção inválida!" -ForegroundColor Red
        }
    }
    
    if ($continue -and $choice -ne "0") {
        Write-Host "`nPressione qualquer tecla para continuar..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
}

Write-Host "`n👋 Até logo!" -ForegroundColor Cyan 