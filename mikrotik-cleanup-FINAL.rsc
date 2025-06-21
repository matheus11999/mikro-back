# Script de limpeza com notificação da API - FUNCIONAL
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"
:local apiToken "API_Access_2024_Strong_Token_P4uQ9wE6rT2yU1iO"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local apiBaseUrl "https://api.lucro.top"

:log info "=== LIMPEZA AUTOMATICA INICIADA ==="

:local removidos 0
:local total 0
:local erros 0

:local notificarDisconnect do={
    :local mac $1
    :local payload "{\"token\":\"$authToken\",\"mac_address\":\"$mac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"disconnect\"}"
    :do {
        /tool fetch url="$apiBaseUrl/api/mikrotik/auth-notification" http-method=post http-header-field="Authorization: Bearer $apiToken,Content-Type: application/json" http-data=$payload dst-path="cleanup-notify.txt"
        :delay 500ms
        /file remove [find name="cleanup-notify.txt"]
        :log info "Notificacao disconnect enviada para $mac"
    } on-error={
        :log error "Falha ao notificar disconnect para $mac"
    }
}

:local currentTime [/system clock get time]
:local currentHour [:tonum [:pick $currentTime 0 [:find $currentTime ":"]]]
:local currentMin [:tonum [:pick $currentTime 3 5]]
:local currentMinutes (($currentHour * 60) + $currentMin)

:log info "Horario atual: $currentTime ($currentMinutes minutos desde meia-noite)"

:foreach scheduler in=[/system scheduler find where name~"rm-"] do={
    :set total ($total + 1)
    :local schedulerInfo [/system scheduler get $scheduler]
    :local schedulerName ($schedulerInfo->"name")
    :local startTime ($schedulerInfo->"start-time")
    
    :local schedHour [:tonum [:pick $startTime 0 [:find $startTime ":"]]]
    :local schedMin [:tonum [:pick $startTime 3 5]]
    :local schedMinutes (($schedHour * 60) + $schedMin)
    
    :log info "Verificando scheduler: $schedulerName (agendado para $startTime = $schedMinutes min)"
    
    :if ($currentMinutes >= $schedMinutes) do={
        :log info "Scheduler expirado encontrado: $schedulerName"
        
        :local macFromName [:pick $schedulerName 3 [:len $schedulerName]]
        
        :do {
            /ip hotspot ip-binding remove [find mac-address=$macFromName]
            :log info "IP Binding removido para $macFromName"
            
            $notificarDisconnect $macFromName
            
            /system scheduler remove $scheduler
            :log info "Scheduler removido: $schedulerName"
            
            :set removidos ($removidos + 1)
            
        } on-error={
            :log error "Erro ao processar scheduler expirado: $schedulerName"
            :set erros ($erros + 1)
        }
    } else={
        :log info "Scheduler ainda valido: $schedulerName (faltam $(($schedMinutes - $currentMinutes)) minutos)"
    }
}

:log info "=== LIMPEZA CONCLUIDA ==="
:log info "Total verificados: $total"
:log info "Removidos: $removidos"
:log info "Erros: $erros"
:log info "Ativos: $(($total - $removidos - $erros))" 