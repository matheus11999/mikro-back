:log info "=== TESTE BASICO INICIADO ==="
:put "Script de teste executando!"

:local agora [/system clock get time]
:local hoje [/system clock get date]
:log info "Data/Hora atual: $hoje $agora"

:local hora [:tonum [:pick $agora 0 [:find $agora ":"]]]
:local min [:tonum [:pick $agora 3 5]]
:log info "Hora atual: $hora:$min"

:local totalMin (($hora * 60) + $min + 60)
:local novaHora ($totalMin / 60)
:local novoMin ($totalMin % 60)
:log info "Teste calculo: $hora:$min + 60min = $novaHora:$novoMin"

:log info "Testando conectividade com API..."
:local apiUrl "https://api.lucro.top/api/recent-sales-json/78957cd3-7096-4acd-970b-0aa0a768c555"

:do {
    /tool fetch url=$apiUrl http-method=get dst-path="teste.txt"
    :delay 2s
    
    :local resposta ""
    :do {
        :set resposta [/file get [find name="teste.txt"] contents]
        :log info "Resposta da API: $resposta"
        /file remove [find name="teste.txt"]
    } on-error={
        :log error "Erro ao ler resposta da API"
    }
    
} on-error={
    :log error "Erro ao conectar com API"
}

:log info "Testando criacao de binding..."
:do {
    /ip hotspot ip-binding add mac-address=AA:BB:CC:DD:EE:FF type=bypassed comment="TESTE"
    :log info "Binding de teste criado"
    
    :delay 1s
    
    /ip hotspot ip-binding remove [find mac-address=AA:BB:CC:DD:EE:FF]
    :log info "Binding de teste removido"
} on-error={
    :log error "Erro ao testar binding"
}

:log info "Testando scheduler..."
:do {
    /system scheduler add name="teste-sched" start-time=23:59:59 interval=0 on-event=":log info \"teste\"" comment="TESTE"
    :log info "Scheduler de teste criado"
    
    :delay 1s
    
    /system scheduler remove [find name="teste-sched"]
    :log info "Scheduler de teste removido"
} on-error={
    :log error "Erro ao testar scheduler"
}

:log info "=== TESTE BASICO CONCLUIDO - TUDO OK ===" 