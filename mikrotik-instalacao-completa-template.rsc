# ============================================================================
# INSTALAÇÃO COMPLETA - SISTEMA PIX MIKROTIK
# API: https://api.lucro.top
# MikroTik ID: MIKROTIK_ID_AQUI
# Token: API_TOKEN_AQUI
# ============================================================================

# PASSO 1: Criar script verificador de pagamentos
/system script add name="pix-verificador" source={
:local apiUrl "https://api.lucro.top/api/recent-sales"
:local mikrotikId "MIKROTIK_ID_AQUI"
:local apiToken "API_TOKEN_AQUI"
:log info "=== PIX VERIFICADOR INICIADO ==="
:local macs ""
:local tentativas 5
:for tentativa from=1 to=$tentativas do={
    :log info "Tentativa $tentativa de $tentativas"
    :local jsonData "{\"mikrotik_id\":\"$mikrotikId\",\"token\":\"$apiToken\"}"
    :do {
        /tool fetch url=$apiUrl http-method=post http-header-field="Content-Type:application/json" http-data=$jsonData dst-path="vendas.txt"
        :delay 2s
        :if ([/file find name="vendas.txt"] != "") do={
            :local vendas [/file get [find name="vendas.txt"] contents]
            /file remove [find name="vendas.txt"]
            :if ([:len $vendas] > 0) do={
                :log info "Vendas encontradas: $vendas"
                :local pos [:find $vendas "-"]
                :if ($pos >= 0) do={
                    :local mac [:pick $vendas 0 $pos]
                    :local resto [:pick $vendas ($pos + 1) [:len $vendas]]
                    :local pos2 [:find $resto "-"]
                    :local senha [:pick $resto 0 $pos2]
                    :local resto2 [:pick $resto ($pos2 + 1) [:len $resto]]
                    :local pos3 [:find $resto2 "-"]
                    :local macAddr [:pick $resto2 0 $pos3]
                    :local minutos [:tonum [:pick $resto2 ($pos3 + 1) [:len $resto2]]]
                    :log info "Processando: MAC=$macAddr, Minutos=$minutos"
                    :if ([:find $macs $macAddr] < 0) do={
                        :do { /ip hotspot ip-binding remove [find mac-address=$macAddr] } on-error={}
                        :local agora [/system clock get time]
                        :local h [:tonum [:pick $agora 0 2]]
                        :local m [:tonum [:pick $agora 3 5]]
                        :local novoMin (($h * 60) + $m + $minutos)
                        :local novaH ($novoMin / 60)
                        :local novaM ($novoMin % 60)
                        :if ($novaH >= 24) do={ :set novaH ($novaH - 24) }
                        :local hs [:tostr $novaH]
                        :local ms [:tostr $novaM]
                        :if ([:len $hs] = 1) do={ :set hs ("0" . $hs) }
                        :if ([:len $ms] = 1) do={ :set ms ("0" . $ms) }
                        :local dataExpire ([/system clock get date] . "-" . $hs . $ms)
                        :local comentario ("PIX-EXPIRE-" . $dataExpire . "-" . $macAddr)
                        /ip hotspot ip-binding add mac-address=$macAddr type=bypassed comment=$comentario
                        :log info "Binding criado: $macAddr expira em $dataExpire"
                        :set macs ($macs . $macAddr . ";")
                    }
                }
                :set tentativa $tentativas
            } else={ :log info "Nenhuma venda nova encontrada" }
        } else={ :log error "Arquivo vendas.txt não foi criado" }
    } on-error={ :log error "Erro na tentativa $tentativa: $!" }
}
:if ([:len $macs] > 0) do={
    :global pixMacsNotificar $macs
    :global pixAcaoNotificar "connect"
    :log info "Executando notificador para MACs: $macs"
    :do { /system script run notificador-pix } on-error={ :log error "Erro ao executar notificador: $!" }
} else={ :log info "Nenhum MAC novo processado" }
:log info "=== PIX VERIFICADOR CONCLUIDO ==="
}

# PASSO 2: Criar script de limpeza
/system script add name="pix-limpeza" source={
:local mikrotikId "MIKROTIK_ID_AQUI"
:local apiToken "API_TOKEN_AQUI"
:log info "=== LIMPEZA AUTOMATICA INICIADA ==="
:local agora [/system clock get time]
:local hoje [/system clock get date]
:local h [:tonum [:pick $agora 0 [:find $agora ":"]]]
:local m [:tonum [:pick $agora 3 5]]
:local minAtual (($h * 60) + $m)
:local pos1 [:find $hoje "-"]
:local anoAtual [:tonum [:pick $hoje 0 $pos1]]
:local resto1 [:pick $hoje ($pos1 + 1) [:len $hoje]]
:local pos2 [:find $resto1 "-"]
:local mesAtual [:tonum [:pick $resto1 0 $pos2]]
:local diaAtual [:tonum [:pick $resto1 ($pos2 + 1) [:len $resto1]]]
:log info "Data/Hora atual: $anoAtual-$mesAtual-$diaAtual $h:$m"
:local macsExpirados ""
:local removidos 0
:local total 0
:foreach binding in=[/ip hotspot ip-binding find where comment~"PIX-EXPIRE-"] do={
    :set total ($total + 1)
    :local comentario [/ip hotspot ip-binding get $binding comment]
    :local macAddress [/ip hotspot ip-binding get $binding mac-address]
    :local pos [:find $comentario "PIX-EXPIRE-"]
    :local dados [:pick $comentario ($pos + 11) [:len $comentario]]
    :local p1 [:find $dados "-"]
    :local ano [:tonum [:pick $dados 0 $p1]]
    :local resto1 [:pick $dados ($p1 + 1) [:len $dados]]
    :local p2 [:find $resto1 "-"]
    :local mes [:tonum [:pick $resto1 0 $p2]]
    :local resto2 [:pick $resto1 ($p2 + 1) [:len $resto1]]
    :local p3 [:find $resto2 "-"]
    :local dia [:tonum [:pick $resto2 0 $p3]]
    :local resto3 [:pick $resto2 ($p3 + 1) [:len $resto2]]
    :local p4 [:find $resto3 "-"]
    :local horaStr [:pick $resto3 0 $p4]
    :local horas [:tonum [:pick $horaStr 0 2]]
    :local mins [:tonum [:pick $horaStr 2 4]]
    :local minExpire (($horas * 60) + $mins)
    :local expirou false
    :local dataAtualNum (($anoAtual * 10000) + ($mesAtual * 100) + $diaAtual)
    :local dataExpireNum (($ano * 10000) + ($mes * 100) + $dia)
    :if ($dataExpireNum < $dataAtualNum) do={ :set expirou true }
    :if ($dataExpireNum = $dataAtualNum and $minExpire <= $minAtual) do={ :set expirou true }
    :if ($expirou) do={
        :log info "REMOVENDO binding: $macAddress"
        :do {
            /ip hotspot ip-binding remove $binding
            :set macsExpirados ($macsExpirados . $macAddress . ";")
            :set removidos ($removidos + 1)
        } on-error={ :log error "Erro ao remover binding: $macAddress" }
    }
}
:if ([:len $macsExpirados] > 0) do={
    :global pixMacsDesconectar $macsExpirados
    :do { /system script run notificador-desconectado } on-error={}
}
:log info "=== LIMPEZA CONCLUIDA: Total=$total Removidos=$removidos ==="
}

# PASSO 3: Criar script de heartbeat
/system script add name="pix-heartbeat" source={
:local apiUrl "https://api.lucro.top/api/mikrotik/heartbeat"
:local mikrotikId "MIKROTIK_ID_AQUI"
:local apiToken "API_TOKEN_AQUI"
:local version [/system resource get version]
:local uptime [/system resource get uptime]
:local jsonData "{\"mikrotik_id\":\"$mikrotikId\",\"token\":\"$apiToken\",\"version\":\"$version\",\"uptime\":\"$uptime\"}"
:log info "=== HEARTBEAT INICIADO ==="
:do {
    /tool fetch url=$apiUrl http-method=post http-header-field="Content-Type:application/json" http-data=$jsonData
    :log info "Heartbeat enviado com sucesso"
} on-error={ :log error "Erro ao enviar heartbeat: $!" }
:log info "=== HEARTBEAT CONCLUIDO ==="
}

# PASSO 4: Criar schedulers
/system scheduler add name="pix-verificador-scheduler" start-time=startup interval=40s on-event="/system script run pix-verificador"
/system scheduler add name="pix-limpeza-scheduler" start-time=startup interval=2m on-event="/system script run pix-limpeza"
/system scheduler add name="pix-heartbeat-scheduler" start-time=startup interval=5m on-event="/system script run pix-heartbeat"

# PASSO 5: Executar teste inicial
:log info "=== INSTALACAO COMPLETA FINALIZADA ==="
:log info "Scripts criados: pix-verificador, pix-limpeza, pix-heartbeat"
:log info "Schedulers criados: verificador (40s), limpeza (2m), heartbeat (5m)"
:log info "Executando teste de heartbeat..."
/system script run pix-heartbeat 