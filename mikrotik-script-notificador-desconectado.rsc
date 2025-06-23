# Script Notificador - Desconexões
# URL: https://api.lucro.top/api/mikrotik/auth-notification
# MikroTik ID: 78957cd3-7096-4acd-970b-0aa0a768c555
# Token: mtk_241ca9a5_cb1f8255

:global pixMacsDesconectar

:log info "=== NOTIFICADOR DESCONEXAO INICIADO ==="

# Verificar se a variável global está definida
:if ([:typeof $pixMacsDesconectar] = "nothing") do={
    :log error "Variável pixMacsDesconectar não definida"
    return
}

:log info "MACs para desconectar: $pixMacsDesconectar"

:local apiUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local apiToken "mtk_241ca9a5_cb1f8255"

# Processar cada MAC separadamente
:local pos 0
:while ([:find $pixMacsDesconectar ";" $pos] >= 0) do={
    :local fim [:find $pixMacsDesconectar ";" $pos]
    :local mac [:pick $pixMacsDesconectar $pos $fim]
    
    :if ([:len $mac] > 0) do={
        :log info "Processando desconexão: $mac"
        
        :local jsonData "{\"mikrotik_id\":\"$mikrotikId\",\"token\":\"$apiToken\",\"mac_address\":\"$mac\",\"action\":\"disconnect\"}"
        
        :do {
            /tool fetch url=$apiUrl http-method=post http-header-field="Content-Type:application/json" http-data=$jsonData keep-result=no
            :log info "Disconnect enviado com sucesso para: $mac"
        } on-error={
            :log error "Erro ao enviar disconnect para: $mac - $!"
        }
    }
    
    :set pos ($fim + 1)
}

# Limpar variável global após processamento
:set pixMacsDesconectar

:log info "=== NOTIFICADOR DESCONEXAO FINALIZADO ===" 