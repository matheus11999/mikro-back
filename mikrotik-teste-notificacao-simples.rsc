:log info "=== TESTE DE NOTIFICACAO API ==="

:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"
:local testMac "AA:BB:CC:DD:EE:FF"

:log info "Criando IP binding de teste..."
/ip hotspot ip-binding add mac-address=$testMac type=bypassed comment="TESTE-NOTIFICACAO"
:log info "IP Binding criado para $testMac"

:log info "Notificando API sobre CONNECT..."
:local payload "{\"token\":\"$authToken\",\"mac_address\":\"$testMac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"connect\"}"
:log info "Payload: $payload"

:do {
    /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload dst-path="resposta.txt"
    :delay 2s
    
    :local resposta [/file get [find name="resposta.txt"] contents]
    :log info "Resposta da API: $resposta"
    /file remove [find name="resposta.txt"]
    
    :log info "✓ NOTIFICACAO ENVIADA COM SUCESSO!"
    
} on-error={
    :log error "✗ FALHA AO NOTIFICAR API"
}

:log info "Aguardando 3 segundos..."
:delay 3s

:log info "Notificando API sobre DISCONNECT..."
:local payloadDisc "{\"token\":\"$authToken\",\"mac_address\":\"$testMac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"disconnect\"}"

:do {
    /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payloadDisc dst-path="resposta2.txt"
    :delay 2s
    
    :local resposta2 [/file get [find name="resposta2.txt"] contents]
    :log info "Resposta DISCONNECT: $resposta2"
    /file remove [find name="resposta2.txt"]
    
    :log info "✓ DISCONNECT NOTIFICADO COM SUCESSO!"
    
} on-error={
    :log error "✗ FALHA AO NOTIFICAR DISCONNECT"
}

:log info "Removendo IP binding de teste..."
/ip hotspot ip-binding remove [find mac-address=$testMac]
:log info "IP Binding removido"

:log info "=== TESTE FINALIZADO ===" 