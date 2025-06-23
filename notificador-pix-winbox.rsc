:global pixMacsNotificar
:global pixAcaoNotificar

:log info "=== NOTIFICADOR PIX INICIADO ==="

:if ([:typeof $pixMacsNotificar] = "nothing") do={
    :log error "Variavel pixMacsNotificar nao definida"
    :return
}

:if ([:typeof $pixAcaoNotificar] = "nothing") do={
    :log error "Variavel pixAcaoNotificar nao definida"
    :return
}

:log info "MACs para notificar: $pixMacsNotificar"
:log info "Acao: $pixAcaoNotificar"

:local apiUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local apiToken "mtk_241ca9a5_cb1f8255"

:local notificarMac do={
    :local mac $1
    :local acao $2
    :local tentativas 0
    :local sucesso false
    
    :log info "Processando notificacao: $acao para MAC $mac"
    
    :local jsonData "{\"mikrotik_id\":\"$mikrotikId\",\"token\":\"$apiToken\",\"mac_address\":\"$mac\",\"action\":\"$acao\"}"
    
    :while ($tentativas < 3 and !$sucesso) do={
        :set tentativas ($tentativas + 1)
        :log info "Tentativa $tentativas de notificacao para $mac"
        
        :do {
            :local timeout (5 + ($tentativas * 3))
            /tool fetch url=$apiUrl http-method=post http-header-field="Content-Type:application/json" http-data=$jsonData dst-path="notif_$mac.txt" timeout=$timeout
            :delay 2s
            
            :local resposta ""
            :do {
                :set resposta [/file get [find name="notif_$mac.txt"] contents]
                :log info "Resposta da API para $mac: $resposta"
            } on-error={
                :log info "Resposta recebida mas nao foi possivel ler o arquivo"
            }
            
            :do {
                /file remove [find name="notif_$mac.txt"]
            } on-error={}
            
            :set sucesso true
            :log info "Notificacao enviada com sucesso para: $mac (tentativa $tentativas)"
            
        } on-error={
            :log warning "Erro na tentativa $tentativas para $mac: $!"
            :if ($tentativas < 3) do={
                :delay (2 * $tentativas)s
            }
        }
    }
    
    :if (!$sucesso) do={
        :log error "Falha total na notificacao para: $mac apos 3 tentativas"
    }
    
    :return $sucesso
}

:local pos 0
:local totalMacs 0
:local sucessos 0

:while ([:find $pixMacsNotificar ";" $pos] >= 0) do={
    :local fim [:find $pixMacsNotificar ";" $pos]
    :local mac [:pick $pixMacsNotificar $pos $fim]
    
    :if ([:len $mac] > 0) do={
        :set totalMacs ($totalMacs + 1)
        :local resultado [$notificarMac $mac $pixAcaoNotificar]
        :if ($resultado) do={
            :set sucessos ($sucessos + 1)
        }
        :delay 1s
    }
    
    :set pos ($fim + 1)
}

:if ($pos < [:len $pixMacsNotificar]) do={
    :local ultimoMac [:pick $pixMacsNotificar $pos [:len $pixMacsNotificar]]
    :if ([:len $ultimoMac] > 0) do={
        :set totalMacs ($totalMacs + 1)
        :local resultado [$notificarMac $ultimoMac $pixAcaoNotificar]
        :if ($resultado) do={
            :set sucessos ($sucessos + 1)
        }
    }
}

:set pixMacsNotificar
:set pixAcaoNotificar

:log info "=== NOTIFICADOR PIX FINALIZADO ==="
:log info "Total de MACs processados: $totalMacs"
:log info "Notificacoes bem-sucedidas: $sucessos"
:log info "Notificacoes falharam: " . ($totalMacs - $sucessos) 