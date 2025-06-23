# Script de Heartbeat - MikroTik PIX System
# Configurado para: api.lucro.top
# MikroTik ID: 78957cd3-7096-4acd-970b-0aa0a768c555

:local apiUrl "https://api.lucro.top/api/mikrotik/heartbeat"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local apiToken "mtk_241ca9a5_cb1f8255"

:local version [/system resource get version]
:local uptime [/system resource get uptime]

:local jsonData ("{\"mikrotik_id\":\"" . $mikrotikId . "\",\"token\":\"" . $apiToken . "\",\"version\":\"" . $version . "\",\"uptime\":\"" . $uptime . "\"}")

:log info "Heartbeat: Enviando para $apiUrl"

:do {
    /tool fetch url=$apiUrl http-method=post http-header-field="Content-Type:application/json" http-data=$jsonData
    :log info "Heartbeat: Sucesso"
} on-error={
    :log error ("Heartbeat: Erro - " . $!)
} 