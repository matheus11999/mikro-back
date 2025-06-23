:log info "SCRIPT INICIADO"

:local apiUrl "https://api.lucro.top/api/recent-sales/78957cd3-7096-4acd-970b-0aa0a768c555"

:log info "Buscando vendas..."
/tool fetch url=$apiUrl http-method=get dst-path="vendas.txt"
:delay 3s

:local vendas [/file get [find name="vendas.txt"] contents]
:log info "Dados: $vendas"
/file remove [find name="vendas.txt"]

:if ([:len $vendas] = 0) do={
    :log info "Sem vendas"
    return
}

:local pos [:find $vendas "-"]
:if ($pos < 0) do={
    :log error "Formato errado: $vendas"
    return
}

:local mac [:pick $vendas 0 $pos]
:local min [:tonum [:pick $vendas ($pos + 1) [:len $vendas]]]

:log info "MAC: $mac"
:log info "Minutos: $min"

:log info "Removendo binding anterior"
:do { /ip hotspot ip-binding remove [find mac-address=$mac] } on-error={}

:log info "Criando binding"
/ip hotspot ip-binding add mac-address=$mac type=bypassed comment="PIX-$mac"
:log info "Binding criado!"

:local agora [/system clock get time]
:local h [:tonum [:pick $agora 0 [:find $agora ":"]]]
:local m [:tonum [:pick $agora 3 5]]

:local total (($h * 60) + $m + $min)
:local novaH ($total / 60)
:local novaM ($total % 60)

:if ($novaH >= 24) do={ :set novaH ($novaH - 24) }

:local hs [:tostr $novaH]
:local ms [:tostr $novaM]
:if ([:len $hs] = 1) do={ :set hs ("0" . $hs) }
:if ([:len $ms] = 1) do={ :set ms ("0" . $ms) }

:local tempo ($hs . ":" . $ms . ":00")
:log info "Expira: $tempo"

:local nome "rm-$mac"
:do { /system scheduler remove [find name=$nome] } on-error={}

/system scheduler add name=$nome start-time=$tempo interval=0 on-event="/ip hotspot ip-binding remove [find mac-address=$mac]" comment="RM-$mac"

:log info "Scheduler criado: $nome"
:log info "SCRIPT CONCLUIDO" 