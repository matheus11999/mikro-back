:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"
:local apiToken "API_Access_2024_Strong_Token_P4uQ9wE6rT2yU1iO"
:local testMac "E2:26:89:13:AD:71"

:log info "=== TESTE DE NOTIFICACAO API ==="

:log info "URL: $authUrl"
:log info "MAC de teste: $testMac"
:log info "Mikrotik ID: $mikrotikId"

:local payload "{\"token\":\"$authToken\",\"mac_address\":\"$testMac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"connect\"}"
:log info "Payload: $payload"

:log info "Tentativa 1: Metodo original"
:do {
    /tool fetch url=$authUrl http-method=post http-header-field="Authorization: Bearer $apiToken,Content-Type: application/json" http-data=$payload dst-path="test1.txt"
    :delay 2s
    :local resp1 [/file get [find name="test1.txt"] contents]
    :log info "Resposta 1: $resp1"
    /file remove [find name="test1.txt"]
} on-error={
    :log error "ERRO Tentativa 1"
}

:log info "Tentativa 2: Headers separados"
:do {
    /tool fetch url=$authUrl http-method=post http-header-field="Authorization: Bearer $apiToken" http-header-field="Content-Type: application/json" http-data=$payload dst-path="test2.txt"
    :delay 2s
    :local resp2 [/file get [find name="test2.txt"] contents]
    :log info "Resposta 2: $resp2"
    /file remove [find name="test2.txt"]
} on-error={
    :log error "ERRO Tentativa 2"
}

:log info "Tentativa 3: Sem Authorization header"
:do {
    /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload dst-path="test3.txt"
    :delay 2s
    :local resp3 [/file get [find name="test3.txt"] contents]
    :log info "Resposta 3: $resp3"
    /file remove [find name="test3.txt"]
} on-error={
    :log error "ERRO Tentativa 3"
}

:log info "Tentativa 4: URL com parametros"
:local urlParam "$authUrl?token=$apiToken"
:do {
    /tool fetch url=$urlParam http-method=post http-header-field="Content-Type: application/json" http-data=$payload dst-path="test4.txt"
    :delay 2s
    :local resp4 [/file get [find name="test4.txt"] contents]
    :log info "Resposta 4: $resp4"
    /file remove [find name="test4.txt"]
} on-error={
    :log error "ERRO Tentativa 4"
}

:log info "Tentativa 5: GET simples para testar conectividade"
:do {
    /tool fetch url="https://api.lucro.top/api/planos" http-method=get dst-path="test5.txt"
    :delay 2s
    :local resp5 [/file get [find name="test5.txt"] contents]
    :log info "GET planos OK - API acessivel"
    /file remove [find name="test5.txt"]
} on-error={
    :log error "ERRO na conectividade basica com API"
}

:log info "=== TESTE CONCLUIDO ===" 