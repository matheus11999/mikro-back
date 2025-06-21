:local apiBaseUrl "https://api.lucro.top"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"
:local apiToken "API_Access_2024_Strong_Token_P4uQ9wE6rT2yU1iO"

:log info "=== PIX SCRIPT TEXTO INICIADO ==="
:put "PIX Script (texto) iniciando..."

:local notificar do={
    :local mac $1
    :local acao $2
    :local payload "{\"token\":\"$authToken\",\"mac_address\":\"$mac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"$acao\"}"
    :do {
        /tool fetch url="$apiBaseUrl/api/mikrotik/auth-notification" http-method=post http-header-field="Authorization: Bearer $apiToken,Content-Type: application/json" http-data=$payload dst-path="notify.txt"
        :delay 1s
        /file remove [find name="notify.txt"]
        :log info "Notificacao $acao enviada para $mac"
    } on-error={
        :log error "Falha ao notificar $acao para $mac"
    }
}

:log info "Buscando vendas da API (texto)..."
:local apiUrl "$apiBaseUrl/api/recent-sales/$mikrotikId"

:do {
    /tool fetch url=$apiUrl http-method=get http-header-field="Authorization: Bearer $apiToken" dst-path="vendas.txt"
    :delay 3s
} on-error={
    :log error "ERRO: Nao foi possivel conectar a API"
    return
}

:local vendas ""
:do {
    :set vendas [/file get [find name="vendas.txt"] contents]
    /file remove [find name="vendas.txt"]
} on-error={
    :log error "ERRO: Nao foi possivel ler dados da API"
    return
}

:if ([:len $vendas] = 0) do={
    :log info "Nenhuma venda encontrada"
    return
}

:log info "Dados recebidos: $vendas"
:log info "Processando vendas texto..."

:local linhas [:toarray ""]
:local linha ""
:local i 0

:while ($i < [:len $vendas]) do={
    :local char [:pick $vendas $i ($i+1)]
    :if ($char = "\n" or $char = "\r") do={
        :if ([:len $linha] > 0) do={
            :set linhas ($linhas, $linha)
            :set linha ""
        }
    } else={
        :set linha ($linha . $char)
    }
    :set i ($i + 1)
}

:if ([:len $linha] > 0) do={
    :set linhas ($linhas, $linha)
}

:local vendasProcessadas 0

:foreach linhaAtual in=$linhas do={
    :if ([:len $linhaAtual] > 0) do={
        :local separador [:find $linhaAtual "-"]
        
        :if ($separador >= 0) do={
            :local mac [:pick $linhaAtual 0 $separador]
            :local minutosStr [:pick $linhaAtual ($separador + 1) [:len $linhaAtual]]
            :local minutos [:tonum $minutosStr]
            
            :log info "Processando MAC: $mac ($minutos min)"
            
            :do { /ip hotspot ip-binding remove [find mac-address=$mac] } on-error={}
            :do { /ip hotspot user remove [find mac-address=$mac] } on-error={}
            
            :do {
                /ip hotspot ip-binding add mac-address=$mac type=bypassed comment="PIX-$mac-$minutos"
                :log info "Binding criado para $mac"
                $notificar $mac "connect"
                
                :local agora [/system clock get time]
                :local horaAtual [:tonum [:pick $agora 0 [:find $agora ":"]]]
                :local minAtual [:tonum [:pick $agora 3 5]]
                :local segAtual [:tonum [:pick $agora 6 8]]
                
                :local totalMin (($horaAtual * 60) + $minAtual + $minutos)
                :local horaFim ($totalMin / 60)
                :local minFim ($totalMin % 60)
                
                :if ($horaFim >= 24) do={ :set horaFim ($horaFim - 24) }
                
                :local horaStr [:tostr $horaFim]
                :local minStr [:tostr $minFim]
                :local segStr [:tostr $segAtual]
                
                :if ([:len $horaStr] = 1) do={ :set horaStr ("0" . $horaStr) }
                :if ([:len $minStr] = 1) do={ :set minStr ("0" . $minStr) }
                :if ([:len $segStr] = 1) do={ :set segStr ("0" . $segStr) }
                
                :local tempoFim ($horaStr . ":" . $minStr . ":" . $segStr)
                :local nomeScheduler "rm-$mac"
                
                :do { /system scheduler remove [find name=$nomeScheduler] } on-error={}
                
                :local cmdCompleto "/ip hotspot ip-binding remove [find mac-address=$mac]; /tool fetch url=\"$apiBaseUrl/api/mikrotik/auth-notification\" http-method=post http-header-field=\"Authorization: Bearer $apiToken,Content-Type: application/json\" http-data=\"{\\\"token\\\":\\\"$authToken\\\",\\\"mac_address\\\":\\\"$mac\\\",\\\"mikrotik_id\\\":\\\"$mikrotikId\\\",\\\"action\\\":\\\"disconnect\\\"}\"; /system scheduler remove [find name=\"$nomeScheduler\"]"
                
                /system scheduler add name=$nomeScheduler start-time=$tempoFim interval=0 on-event=$cmdCompleto comment="Remove $mac"
                :log info "Agendado para $tempoFim: $mac"
                
                :set vendasProcessadas ($vendasProcessadas + 1)
                
            } on-error={
                :log error "Falha ao criar binding para $mac"
            }
        }
    }
}

:log info "=== PIX SCRIPT CONCLUIDO - $vendasProcessadas vendas processadas ===" 