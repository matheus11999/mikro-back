:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"

:log info "LIMPEZA AUTOMATICA INICIADA"

:local notificarDisconnect do={
    :local mac $1
    :local payload "{\"token\":\"$authToken\",\"mac_address\":\"$mac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"disconnect\"}"
    :do {
        /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload dst-path="cleanup.tmp"
        :delay 500ms
        /file remove [find name="cleanup.tmp"]
        :log info "Disconnect notificado para $mac"
    } on-error={
        :log warning "Falha ao notificar disconnect para $mac"
    }
}

:local agora [/system clock get time]
:local horaAtual [:tonum [:pick $agora 0 [:find $agora ":"]]]
:local minAtual [:tonum [:pick $agora 3 5]]
:local minutosAtuais (($horaAtual * 60) + $minAtual)

:log info "Horario atual: $agora ($minutosAtuais minutos)"

:local removidos 0
:local total 0

:foreach scheduler in=[/system scheduler find where name~"pixrm-"] do={
    :set total ($total + 1)
    :local schedulerInfo [/system scheduler get $scheduler]
    :local schedulerName ($schedulerInfo->"name")
    :local startTime ($schedulerInfo->"start-time")
    
    :local schedHora [:tonum [:pick $startTime 0 [:find $startTime ":"]]]
    :local schedMin [:tonum [:pick $startTime 3 5]]
    :local schedulerMinutos (($schedHora * 60) + $schedMin)
    
    :log info "Verificando: $schedulerName (agendado: $startTime = $schedulerMinutos min)"
    
    :if ($minutosAtuais >= $schedulerMinutos) do={
        :log info "Scheduler expirado: $schedulerName"
        
        :local macFromName [:pick $schedulerName 6 [:len $schedulerName]]
        
        :do {
            /ip hotspot ip-binding remove [find mac-address=$macFromName]
            :log info "IP Binding removido para $macFromName"
            
            $notificarDisconnect $macFromName
            
            /system scheduler remove $scheduler
            :log info "Scheduler removido: $schedulerName"
            
            :set removidos ($removidos + 1)
            
        } on-error={
            :log error "Erro ao processar scheduler: $schedulerName"
        }
    } else={
        :local faltam ($schedulerMinutos - $minutosAtuais)
        :log info "Scheduler ativo: $schedulerName (faltam $faltam min)"
    }
}

:log info "LIMPEZA CONCLUIDA"
:log info "Total: $total | Removidos: $removidos | Ativos: $(($total - $removidos))" 