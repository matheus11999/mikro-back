:local apiBaseUrl "https://api.lucro.top"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"
:local apiToken "API_Access_2024_Strong_Token_P4uQ9wE6rT2yU1iO"

:log info "=== PIX SCRIPT JSON INICIADO ==="
:put "PIX Script iniciando..."

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

:log info "Buscando vendas da API (JSON)..."
:local apiUrl "$apiBaseUrl/api/recent-sales-json/$mikrotikId"

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

:if ([:len $vendas] = 0 or $vendas = "[]") do={
    :log info "Nenhuma venda encontrada"
    return
}

:log info "Dados recebidos: $vendas"
:log info "Processando vendas JSON..."

:local pos 0
:local vendasProcessadas 0

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
    
    :set pos ($fim + 1)
}

:log info "=== PIX SCRIPT CONCLUIDO - $vendasProcessadas vendas processadas ===" 