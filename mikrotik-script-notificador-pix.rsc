# Script Notificador PIX - Conexões
# URL: https://api.lucro.top/api/mikrotik/auth-notification
# MikroTik ID: 78957cd3-7096-4acd-970b-0aa0a768c555
# Token: mtk_241ca9a5_cb1f8255

:global pixMacsNotificar
:global pixAcaoNotificar

:log info "=== NOTIFICADOR PIX INICIADO ==="

# Verificar se as variáveis globais estão definidas
:if ([:typeof $pixMacsNotificar] = "nothing") do={
    :log error "Variável pixMacsNotificar não definida"
    return
}

:if ([:typeof $pixAcaoNotificar] = "nothing") do={
    :log error "Variável pixAcaoNotificar não definida"
    return
}

:log info "MACs para notificar: $pixMacsNotificar"
:log info "Ação: $pixAcaoNotificar"

:local apiUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local apiToken "mtk_241ca9a5_cb1f8255"

# Processar cada MAC separadamente
:local pos 0
:while ([:find $pixMacsNotificar ";" $pos] >= 0) do={
    :local fim [:find $pixMacsNotificar ";" $pos]
    :local mac [:pick $pixMacsNotificar $pos $fim]
    
    :if ([:len $mac] > 0) do={
        :log info "Processando MAC: $mac"
        
        :local jsonData "{\"mikrotik_id\":\"$mikrotikId\",\"token\":\"$apiToken\",\"mac_address\":\"$mac\",\"action\":\"$pixAcaoNotificar\"}"
        
        :do {
            /tool fetch url=$apiUrl http-method=post http-header-field="Content-Type:application/json" http-data=$jsonData keep-result=no
            :log info "Notificação enviada com sucesso para: $mac"
        } on-error={
            :log error "Erro ao enviar notificação para: $mac - $!"
        }
    }
    
    :set pos ($fim + 1)
}

# Limpar variáveis globais após processamento
:set pixMacsNotificar
:set pixAcaoNotificar

:log info "=== NOTIFICADOR PIX FINALIZADO ===" 