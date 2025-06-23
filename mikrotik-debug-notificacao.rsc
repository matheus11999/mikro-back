:log info "=== DEBUG NOTIFICACAO ESPECIFICA ==="

:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"
:local macTeste "E2:26:89:13:AD:71"

:log info "Testando notificacao para MAC: $macTeste"

:log info "TESTE 1: Metodo original (como no script principal)"
:local payload1 "{\"token\":\"$authToken\",\"mac_address\":\"$macTeste\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"connect\"}"
:log info "Payload1: $payload1"

:do {
    /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload1 dst-path="test1.txt"
    :delay 2s
    :local resp1 [/file get [find name="test1.txt"] contents]
    :log info "Resposta1: $resp1"
    /file remove [find name="test1.txt"]
    :log info "TESTE 1: SUCESSO"
} on-error={
    :log error "TESTE 1: FALHOU"
}

:delay 2s

:log info "TESTE 2: Com delay maior"
:do {
    /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload1 dst-path="test2.txt"
    :delay 5s
    :local resp2 [/file get [find name="test2.txt"] contents]
    :log info "Resposta2: $resp2"
    /file remove [find name="test2.txt"]
    :log info "TESTE 2: SUCESSO"
} on-error={
    :log error "TESTE 2: FALHOU"
}

:delay 2s

:log info "TESTE 3: Sem arquivo temporario"
:do {
    /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload1
    :delay 3s
    :log info "TESTE 3: SUCESSO (sem arquivo)"
} on-error={
    :log error "TESTE 3: FALHOU"
}

:delay 2s

:log info "TESTE 4: Headers separados"
:do {
    /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload1 dst-path="test4.txt"
    :delay 2s
    :local resp4 [/file get [find name="test4.txt"] contents]
    :log info "Resposta4: $resp4"
    /file remove [find name="test4.txt"]
    :log info "TESTE 4: SUCESSO"
} on-error={
    :log error "TESTE 4: FALHOU"
}

:delay 2s

:log info "TESTE 5: Payload simplificado"
:local payload2 "{\"token\":\"$authToken\",\"mac_address\":\"$macTeste\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"connect\"}"
:log info "Payload2: $payload2"

:do {
    /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload2 dst-path="test5.txt"
    :delay 2s
    :local resp5 [/file get [find name="test5.txt"] contents]
    :log info "Resposta5: $resp5"
    /file remove [find name="test5.txt"]
    :log info "TESTE 5: SUCESSO"
} on-error={
    :log error "TESTE 5: FALHOU"
}

:log info "TESTE 6: Testando conectividade basica"
:do {
    /tool fetch url="https://api.lucro.top/api/planos" http-method=get dst-path="test6.txt"
    :delay 2s
    :local resp6 [/file get [find name="test6.txt"] contents]
    :log info "Conectividade OK - Tamanho resposta: [:len $resp6]"
    /file remove [find name="test6.txt"]
    :log info "TESTE 6: CONECTIVIDADE OK"
} on-error={
    :log error "TESTE 6: SEM CONECTIVIDADE"
}

:log info "=== DEBUG FINALIZADO ===" 