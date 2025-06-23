:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"

:log info "=== TESTE COMPLETO DE FALLBACK ==="

:local testarNotificacaoComFallback do={
    :local mac $1
    :local acao $2
    :local payload "{\"token\":\"$authToken\",\"mac_address\":\"$mac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"$acao\"}"
    
    :log info "🔄 Testando notificacao $acao para $mac..."
    
    # Tentativa 1: Normal
    :local sucesso false
    :do {
        /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload
        :delay 2s
        :set sucesso true
        :log info "✅ Tentativa 1 (POST JSON): SUCESSO para $acao/$mac"
    } on-error={
        :log warning "❌ Tentativa 1 (POST JSON): FALHOU para $acao/$mac"
    }
    
    # Tentativa 2: Com timeout maior
    :if (!$sucesso) do={
        :do {
            /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload timeout=10
            :delay 3s
            :set sucesso true
            :log info "✅ Tentativa 2 (POST timeout): SUCESSO para $acao/$mac"
        } on-error={
            :log warning "❌ Tentativa 2 (POST timeout): FALHOU para $acao/$mac"
        }
    }
    
    # Tentativa 3: Método GET com parâmetros na URL
    :if (!$sucesso) do={
        :local urlGet ($authUrl . "?token=" . $authToken . "&mac_address=" . $mac . "&mikrotik_id=" . $mikrotikId . "&action=" . $acao)
        :do {
            /tool fetch url=$urlGet http-method=get timeout=15
            :delay 3s
            :set sucesso true
            :log info "✅ Tentativa 3 (GET params): SUCESSO para $acao/$mac"
        } on-error={
            :log warning "❌ Tentativa 3 (GET params): FALHOU para $acao/$mac"
        }
    }
    
    # Tentativa 4: POST simples sem headers específicos
    :if (!$sucesso) do={
        :do {
            /tool fetch url=$authUrl http-method=post http-data=$payload timeout=20
            :delay 4s
            :set sucesso true
            :log info "✅ Tentativa 4 (POST simples): SUCESSO para $acao/$mac"
        } on-error={
            :log warning "❌ Tentativa 4 (POST simples): FALHOU para $acao/$mac"
        }
    }
    
    # Resultado final
    :if ($sucesso) do={
        :log info "🎉 FALLBACK FUNCIONOU: $acao para $mac foi notificado"
    } else={
        :log error "💥 FALLBACK FALHOU: TODAS as tentativas falharam para $acao/$mac"
    }
    
    :return $sucesso
}

:log info ""
:log info "1️⃣ TESTANDO CONNECT..."
:local macTeste "AA:BB:CC:DD:EE:99"
:local connectOk [$testarNotificacaoComFallback $macTeste "connect"]

:delay 5s

:log info ""
:log info "2️⃣ TESTANDO DISCONNECT..."
:local disconnectOk [$testarNotificacaoComFallback $macTeste "disconnect"]

:log info ""
:log info "📊 RESULTADO DO TESTE:"
:if ($connectOk) do={
    :log info "✅ CONNECT: Sistema de fallback funcionou"
} else={
    :log error "❌ CONNECT: Sistema de fallback falhou"
}

:if ($disconnectOk) do={
    :log info "✅ DISCONNECT: Sistema de fallback funcionou"
} else={
    :log error "❌ DISCONNECT: Sistema de fallback falhou"
}

:log info ""
:if ($connectOk and $disconnectOk) do={
    :log info "🎯 TESTE COMPLETO: SUCESSO TOTAL!"
    :log info "🔥 Sistema de fallback esta funcionando perfeitamente"
    :log info "📡 Pode ativar os schedulers com seguranca"
} else={
    :if ($connectOk or $disconnectOk) do={
        :log warning "⚠️ TESTE PARCIAL: Pelo menos uma notificacao funcionou"
        :log warning "🔧 Sistema funcionara mas com algumas falhas de notificacao"
    } else={
        :log error "💀 TESTE FALHOU: Nenhuma notificacao funcionou"
        :log error "🚨 Verificar conectividade e configuracoes da API"
    }
}

:log info ""
:log info "🔍 PROXIMOS PASSOS:"
:log info "1. Se tudo funcionou: /system script run mikrotik-schedulers-fallback"
:log info "2. Se houve falhas: Verificar logs da API e conectividade"
:log info "3. Monitorar: /log print where topics~\"script\""

:log info ""
:log info "=== TESTE DE FALLBACK CONCLUIDO ===" 