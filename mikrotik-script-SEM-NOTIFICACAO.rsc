:local apiUrl "https://api.lucro.top/api/recent-sales/78957cd3-7096-4acd-970b-0aa0a768c555"
:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"
:local apiToken "API_Access_2024_Strong_Token_P4uQ9wE6rT2yU1iO"

:log info "=== PIX SCRIPT FUNCIONAL ==="

:local notificarOptional do={
    :local mac $1
    :local acao $2
    :do {
        :local payload "{\"token\":\"$authToken\",\"mac_address\":\"$mac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"$acao\"}"
        /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload dst-path="notify.txt"
        :delay 500ms
        /file remove [find name="notify.txt"]
        :log info "✓ API notificada: $acao para $mac"
    } on-error={
        :log warning "⚠ Notificacao falhou (nao critico): $acao para $mac"
    }
}

:log info "Buscando vendas da API..."
:do {
    /tool fetch url=$apiUrl http-method=get dst-path="vendas.txt"
    :delay 3s
} on-error={
    :log error "ERRO: Falha ao conectar API"
    return
}

:local vendas ""
:do {
    :set vendas [/file get [find name="vendas.txt"] contents]
    /file remove [find name="vendas.txt"]
} on-error={
    :log error "ERRO: Falha ao ler dados"
    return
}

:if ([:len $vendas] = 0) do={
    :log info "Nenhuma venda encontrada"
    return
}

:log info "Processando: $vendas"

:local separador [:find $vendas "-"]
:if ($separador < 0) do={
    :log error "Formato invalido: $vendas"
    return
}

:local mac [:pick $vendas 0 $separador]
:local minutosStr [:pick $vendas ($separador + 1) [:len $vendas]]
:local minutos [:tonum $minutosStr]

:log info "Processando MAC: $mac ($minutos min)"

:log info "Removendo bindings anteriores..."
:do { /ip hotspot ip-binding remove [find mac-address=$mac] } on-error={}
:do { /ip hotspot user remove [find mac-address=$mac] } on-error={}

:log info "Criando IP binding..."
:do {
    /ip hotspot ip-binding add mac-address=$mac type=bypassed comment="PIX-$mac-$minutos"
    :log info "✓ IP Binding criado para $mac"
    
    $notificarOptional $mac "connect"
    
    :local agora [/system clock get time]
    :local hora [:tonum [:pick $agora 0 [:find $agora ":"]]]
    :local min [:tonum [:pick $agora 3 5]]
    :local seg [:tonum [:pick $agora 6 8]]
    
    :local totalMin (($hora * 60) + $min + $minutos)
    :local horaFim ($totalMin / 60)
    :local minFim ($totalMin % 60)
    
    :if ($horaFim >= 24) do={ :set horaFim ($horaFim - 24) }
    
    :local horaStr [:tostr $horaFim]
    :local minStr [:tostr $minFim]
    :local segStr [:tostr $seg]
    
    :if ([:len $horaStr] = 1) do={ :set horaStr ("0" . $horaStr) }
    :if ([:len $minStr] = 1) do={ :set minStr ("0" . $minStr) }
    :if ([:len $segStr] = 1) do={ :set segStr ("0" . $segStr) }
    
    :local tempoFim ($horaStr . ":" . $minStr . ":" . $segStr)
    :log info "Agendado para expirar em: $tempoFim"
    
    :local nomeScheduler "rm-$mac"
    :do { /system scheduler remove [find name=$nomeScheduler] } on-error={}
    
    :local cmdSimples "/ip hotspot ip-binding remove [find mac-address=$mac]; /system scheduler remove [find name=\"$nomeScheduler\"]"
    
    /system scheduler add name=$nomeScheduler start-time=$tempoFim interval=0 on-event=$cmdSimples comment="AutoRemove $mac"
    :log info "✓ Scheduler criado: $nomeScheduler"
    
} on-error={
    :log error "✗ Falha ao criar binding para $mac"
}

:log info "=== SCRIPT CONCLUIDO COM SUCESSO ===" 