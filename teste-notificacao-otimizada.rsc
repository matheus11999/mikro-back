:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"

:log info "=== TESTE DE NOTIFICACAO OTIMIZADA ==="

:local testarNotificacao do={
    :local mac $1
    :local acao $2
    :local payload "{\"token\":\"$authToken\",\"mac_address\":\"$mac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"$acao\"}"
    
    :log info "🔄 Testando notificacao $acao para $mac com fallback robusto..."
    
    # Tentativa 1: POST JSON normal (método original)
    :local sucesso false
    :do {
        /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload timeout=5
        :delay 2s
        :set sucesso true
        :log info "✅ Tentativa 1 (POST JSON) SUCESSO: $acao para $mac"
    } on-error={
        :log warning "❌ Tentativa 1 (POST JSON) falhou: $acao para $mac"
    }
    
    # Tentativa 2: POST JSON com timeout maior
    :if (!$sucesso) do={
        :do {
            /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload timeout=10
            :delay 3s
            :set sucesso true
            :log info "✅ Tentativa 2 (POST timeout) SUCESSO: $acao para $mac"
        } on-error={
            :log warning "❌ Tentativa 2 (POST timeout) falhou: $acao para $mac"
        }
    }
    
    # Tentativa 3: GET com parâmetros na URL
    :if (!$sucesso) do={
        :local urlGet ($authUrl . "?token=" . $authToken . "&mac_address=" . $mac . "&mikrotik_id=" . $mikrotikId . "&action=" . $acao)
        :do {
            /tool fetch url=$urlGet http-method=get timeout=15
            :delay 3s
            :set sucesso true
            :log info "✅ Tentativa 3 (GET params) SUCESSO: $acao para $mac"
        } on-error={
            :log warning "❌ Tentativa 3 (GET params) falhou: $acao para $mac"
        }
    }
    
    # Tentativa 4: POST simples sem Content-Type
    :if (!$sucesso) do={
        :do {
            /tool fetch url=$authUrl http-method=post http-data=$payload timeout=20
            :delay 4s
            :set sucesso true
            :log info "✅ Tentativa 4 (POST simples) SUCESSO: $acao para $mac"
        } on-error={
            :log warning "❌ Tentativa 4 (POST simples) falhou: $acao para $mac"
        }
    }
    
    # Resultado final
    :if ($sucesso) do={
        :log info "🎉 SUCESSO TOTAL: MAC $mac definido como $acao na API!"
        :log info "✅ Sistema de fallback funcionando perfeitamente"
    } else={
        :log error "💥 FALHA TOTAL: Todas as 4 tentativas falharam para $acao/$mac"
        :log error "⚠️ Verificar conectividade e configuracoes da API"
    }
    
    :return $sucesso
}

# Teste com MAC fictício
:local macTeste "E2:26:89:13:AD:71"

:log info ""
:log info "🧪 TESTE 1: CONNECT"
:local testeConnect [$testarNotificacao $macTeste "connect"]

:delay 5s

:log info ""
:log info "🧪 TESTE 2: DISCONNECT"  
:local testeDisconnect [$testarNotificacao $macTeste "disconnect"]

:log info ""
:log info "📊 RESULTADO FINAL:"

:if ($testeConnect) do={
    :log info "✅ CONNECT: Sistema funcionando"
} else={
    :log error "❌ CONNECT: Sistema com problemas"
}

:if ($testeDisconnect) do={
    :log info "✅ DISCONNECT: Sistema funcionando"
} else={
    :log error "❌ DISCONNECT: Sistema com problemas"
}

:log info ""
:if ($testeConnect and $testeDisconnect) do={
    :log info "🎯 TESTE COMPLETO: SISTEMA TOTALMENTE FUNCIONAL!"
    :log info "🚀 Pode usar o script principal com seguranca"
    :log info "📡 Notificacoes estao definindo MACs corretamente na API"
} else={
    :if ($testeConnect or $testeDisconnect) do={
        :log warning "⚠️ TESTE PARCIAL: Pelo menos uma notificacao funcionou"
        :log warning "🔧 Sistema funcionara mas com algumas limitacoes"
    } else={
        :log error "💀 TESTE FALHOU: Sistema de notificacao nao esta funcionando"
        :log error "🚨 Verificar conectividade, token e URL da API"
    }
}

:log info ""
:log info "=== TESTE DE NOTIFICACAO CONCLUIDO ===" 