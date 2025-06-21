:local apiUrl "https://api.lucro.top/api/recent-sales/78957cd3-7096-4acd-970b-0aa0a768c555"
:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"
:local apiToken "API_Access_2024_Strong_Token_P4uQ9wE6rT2yU1iO"

:log info "=== PIX SCRIPT INICIADO ==="

:local notificar do={
    :local mac $1
    :local acao $2
    :local payload "{\"token\":\"$authToken\",\"mac_address\":\"$mac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"$acao\"}"
    :do {
        /tool fetch url=$authUrl http-method=post http-header-field="Authorization: Bearer $apiToken,Content-Type: application/json" http-data=$payload dst-path="notify.txt"
        :delay 1s
        /file remove [find name="notify.txt"]
        :log info "Notificacao $acao enviada para $mac"
    } on-error={
        :log error "Falha ao notificar $acao para $mac"
    }
}

:log info "Buscando vendas da API..."
:do {
    /tool fetch url="$apiUrl?token=$apiToken" http-method=get http-header-field="Authorization: Bearer $apiToken" dst-path="vendas.txt"
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

:log info "Processando vendas..."

:local pos 0
:while ([:find $vendas "{" $pos] >= 0) do={
    :local inicio [:find $vendas "{" $pos]
    :local fim [:find $vendas "}" $inicio]
    
    :if ($fim >= 0) do={
        :local obj [:pick $vendas $inicio ($fim + 1)]
        
        :local macPos [:find $obj "\"mac\":\""]
        :local minPos [:find $obj "\"minutos\":"]
        
        :if ($macPos >= 0 and $minPos >= 0) do={
            :local macStart ($macPos + 7)
            :local macEnd [:find $obj "\"" $macStart]
            :local mac [:pick $obj $macStart $macEnd]
            
            :local minStart ($minPos + 10)
            :local minEnd [:find $obj "}" $minStart]
            :if ($minEnd < 0) do={ :set minEnd [:find $obj "," $minStart] }
            :local minutosStr [:pick $obj $minStart $minEnd]
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
                :local nomeScheduler "del-$mac"
                
                :do { /system scheduler remove [find name=$nomeScheduler] } on-error={}
                
                :local cmdRemover "/ip hotspot ip-binding remove [find mac-address=$mac]"
                :local cmdNotificar "/tool fetch url=$authUrl http-method=post http-header-field=\"Authorization: Bearer $apiToken,Content-Type: application/json\" http-data=\"{\\\"token\\\":\\\"$authToken\\\",\\\"mac_address\\\":\\\"$mac\\\",\\\"mikrotik_id\\\":\\\"$mikrotikId\\\",\\\"action\\\":\\\"disconnect\\\"}\""
                :local cmdLimpar "/system scheduler remove [find name=\"$nomeScheduler\"]"
                :local cmdCompleto "$cmdRemover; $cmdNotificar; $cmdLimpar"
                
                /system scheduler add name=$nomeScheduler start-time=$tempoFim interval=0 on-event=$cmdCompleto comment="Remove $mac"
                :log info "Agendado para $tempoFim: $mac"
                
            } on-error={
                :log error "Falha ao criar binding para $mac"
            }
        }
    }
    
    :set pos ($fim + 1)
}

:log info "=== PIX SCRIPT CONCLUIDO ===" 