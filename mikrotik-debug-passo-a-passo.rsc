:put "PASSO 1: Iniciando"
:log info "PASSO 1: Iniciando"

:put "PASSO 2: Definindo URL"
:local apiUrl "https://api.lucro.top/api/recent-sales/78957cd3-7096-4acd-970b-0aa0a768c555"
:log info "URL: $apiUrl"

:put "PASSO 3: Fazendo fetch"
:log info "PASSO 3: Fazendo fetch"
:do {
    /tool fetch url=$apiUrl http-method=get dst-path="debug.txt"
    :put "PASSO 3a: Fetch OK"
    :log info "PASSO 3a: Fetch OK"
} on-error={
    :put "PASSO 3b: ERRO no fetch"
    :log error "PASSO 3b: ERRO no fetch"
    return
}

:put "PASSO 4: Aguardando"
:delay 3s

:put "PASSO 5: Lendo arquivo"
:local dados ""
:do {
    :set dados [/file get [find name="debug.txt"] contents]
    :put "PASSO 5a: Arquivo lido"
    :log info "PASSO 5a: Dados: [$dados]"
} on-error={
    :put "PASSO 5b: ERRO ao ler"
    :log error "PASSO 5b: ERRO ao ler"
    return
}

:put "PASSO 6: Removendo arquivo"
:do {
    /file remove [find name="debug.txt"]
    :put "PASSO 6a: Arquivo removido"
} on-error={
    :put "PASSO 6b: Erro ao remover arquivo"
}

:put "PASSO 7: Verificando dados"
:if ([:len $dados] = 0) do={
    :put "PASSO 7a: Dados vazios"
    :log info "PASSO 7a: Dados vazios"
    return
}

:put "PASSO 8: Procurando separador"
:local separador [:find $dados "-"]
:log info "PASSO 8: Separador na posicao: $separador"

:if ($separador < 0) do={
    :put "PASSO 8a: Separador nao encontrado"
    :log error "PASSO 8a: Dados: [$dados]"
    return
}

:put "PASSO 9: Extraindo MAC"
:local mac [:pick $dados 0 $separador]
:log info "PASSO 9: MAC extraido: [$mac]"

:put "PASSO 10: Extraindo minutos"
:local minutosRaw [:pick $dados ($separador + 1) [:len $dados]]
:log info "PASSO 10: Minutos raw: [$minutosRaw]"

:local minutos [:tonum $minutosRaw]
:log info "PASSO 10a: Minutos convertidos: $minutos"

:put "PASSO 11: Testando binding"
:do {
    /ip hotspot ip-binding add mac-address=AA:BB:CC:DD:EE:FF type=bypassed comment="TESTE"
    :put "PASSO 11a: Binding teste OK"
    /ip hotspot ip-binding remove [find mac-address=AA:BB:CC:DD:EE:FF]
    :put "PASSO 11b: Binding teste removido"
} on-error={
    :put "PASSO 11c: ERRO no binding teste"
    :log error "PASSO 11c: ERRO no binding teste"
}

:put "PASSO 12: Criando binding real"
:do {
    /ip hotspot ip-binding add mac-address=$mac type=bypassed comment="DEBUG-$mac"
    :put "PASSO 12a: Binding real criado"
    :log info "PASSO 12a: Binding criado para $mac"
} on-error={
    :put "PASSO 12b: ERRO no binding real"
    :log error "PASSO 12b: ERRO no binding real para $mac"
}

:put "SCRIPT DEBUG FINALIZADO"
:log info "SCRIPT DEBUG FINALIZADO" 