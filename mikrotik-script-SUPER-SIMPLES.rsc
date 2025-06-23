:local apiUrl "https://api.lucro.top/api/recent-sales/78957cd3-7096-4acd-970b-0aa0a768c555"
:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"
:local apiToken "API_Access_2024_Strong_Token_P4uQ9wE6rT2yU1iO"

:log info "=== PIX SCRIPT SUPER SIMPLES ==="

:log info "Buscando vendas..."
/tool fetch url=$apiUrl http-method=get http-header-field="Authorization: Bearer $apiToken" dst-path="vendas.txt"
:delay 3s

:local vendas [/file get [find name="vendas.txt"] contents]
:log info "Dados recebidos: $vendas"

/file remove [find name="vendas.txt"]

:if ([:len $vendas] = 0) do={
    :log info "Nenhuma venda"
    return
}

:local separador [:find $vendas "-"]
:if ($separador < 0) do={
    :log error "Formato invalido, esperado: MAC-MINUTOS"
    return
}

:local mac [:pick $vendas 0 $separador]
:local minutosStr [:pick $vendas ($separador + 1) [:len $vendas]]

:local minutos [:tonum $minutosStr]

:log info "MAC: $mac"
:log info "Minutos: $minutos"

:log info "Removendo binding anterior..."
:do { /ip hotspot ip-binding remove [find mac-address=$mac] } on-error={}

:log info "Criando IP binding..."
/ip hotspot ip-binding add mac-address=$mac type=bypassed comment="PIX-$mac-$minutos"
:log info "✓ IP Binding criado!"

:log info "Notificando API connect..."
:local payload "{\"token\":\"$authToken\",\"mac_address\":\"$mac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"connect\"}"
/tool fetch url=$authUrl http-method=post http-header-field="Authorization: Bearer $apiToken,Content-Type: application/json" http-data=$payload dst-path="notify.txt"
:delay 1s
/file remove [find name="notify.txt"]
:log info "✓ API notificada!"

:log info "Calculando expiracao..."
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
:log info "Expira em: $tempoFim"

:local nomeScheduler "rm-$mac"
:do { /system scheduler remove [find name=$nomeScheduler] } on-error={}

:local cmdRemover "/ip hotspot ip-binding remove [find mac-address=$mac]"
:local cmdNotificar "/tool fetch url=$authUrl http-method=post http-header-field=\"Authorization: Bearer $apiToken,Content-Type: application/json\" http-data=\"{\\\"token\\\":\\\"$authToken\\\",\\\"mac_address\\\":\\\"$mac\\\",\\\"mikrotik_id\\\":\\\"$mikrotikId\\\",\\\"action\\\":\\\"disconnect\\\"}\""
:local cmdLimpar "/system scheduler remove [find name=\"$nomeScheduler\"]"
:local cmdCompleto "$cmdRemover; $cmdNotificar; $cmdLimpar"

/system scheduler add name=$nomeScheduler start-time=$tempoFim interval=0 on-event=$cmdCompleto comment="Remove $mac"
:log info "✓ Scheduler criado para $tempoFim"

:log info "=== CONCLUIDO COM SUCESSO ===" 