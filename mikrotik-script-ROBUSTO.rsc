:local apiUrl "https://api.lucro.top/api/recent-sales/78957cd3-7096-4acd-970b-0aa0a768c555"
:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"

:log info "PIX SCRIPT ROBUSTO INICIADO"

:local notificarOptional do={
    :local mac $1
    :local acao $2
    :local payload "{\"token\":\"$authToken\",\"mac_address\":\"$mac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"$acao\"}"
    :do {
        /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload
        :delay 2s
        :log info "API notificada: $acao para $mac"
    } on-error={
        :log warning "Notificacao falhou (nao critico): $acao para $mac"
    }
}

:log info "Buscando vendas da API..."
/tool fetch url=$apiUrl http-method=get dst-path="vendas.txt"
:delay 3s

:local vendas [/file get [find name="vendas.txt"] contents]
/file remove [find name="vendas.txt"]

:if ([:len $vendas] = 0) do={
    :log info "Nenhuma venda encontrada"
    return
}

:log info "Dados recebidos: $vendas"

:local pos [:find $vendas "-"]
:if ($pos < 0) do={
    :log error "Formato invalido: $vendas"
    return
}

:local mac [:pick $vendas 0 $pos]
:local minStr [:pick $vendas ($pos + 1) [:len $vendas]]

:local i 0
:local minLimpo ""
:while ($i < [:len $minStr]) do={
    :local char [:pick $minStr $i ($i+1)]
    :if ($char != "\n" and $char != "\r" and $char != " ") do={
        :set minLimpo ($minLimpo . $char)
    }
    :set i ($i + 1)
}

:local minutos [:tonum $minLimpo]

:log info "Processando: MAC=$mac, Minutos=$minutos"

:log info "Removendo binding anterior..."
:do { /ip hotspot ip-binding remove [find mac-address=$mac] } on-error={}

:log info "Criando IP binding..."
/ip hotspot ip-binding add mac-address=$mac type=bypassed comment="PIX-$mac-$minutos"
:log info "✓ IP Binding criado para $mac"

:log info "Tentando notificar connect..."
$notificarOptional $mac "connect"

:log info "Calculando expiracao..."
:local agora [/system clock get time]
:local h [:tonum [:pick $agora 0 [:find $agora ":"]]]
:local m [:tonum [:pick $agora 3 5]]
:local s [:tonum [:pick $agora 6 8]]

:local totalMin (($h * 60) + $m + $minutos)
:local novaH ($totalMin / 60)
:local novaM ($totalMin % 60)

:if ($novaH >= 24) do={ :set novaH ($novaH - 24) }

:local hs [:tostr $novaH]
:local ms [:tostr $novaM]
:local ss [:tostr $s]

:if ([:len $hs] = 1) do={ :set hs ("0" . $hs) }
:if ([:len $ms] = 1) do={ :set ms ("0" . $ms) }
:if ([:len $ss] = 1) do={ :set ss ("0" . $ss) }

:local tempo ($hs . ":" . $ms . ":" . $ss)
:log info "Expira em: $tempo"

:local nomeScheduler "pixrm-$mac"
:do { /system scheduler remove [find name=$nomeScheduler] } on-error={}

:local cmdSimples "/ip hotspot ip-binding remove [find mac-address=$mac]; /system scheduler remove [find name=\"$nomeScheduler\"]"

/system scheduler add name=$nomeScheduler start-time=$tempo interval=0 on-event=$cmdSimples comment="PIX-EXPIRE-$mac"
:log info "✓ Scheduler criado: $nomeScheduler para $tempo"

:log info "✓ PIX SCRIPT CONCLUIDO - MAC: $mac, Expira: $tempo" 