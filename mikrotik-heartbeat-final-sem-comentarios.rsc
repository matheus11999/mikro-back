:local apiUrl "https://api.lucro.top/api/mikrotik/heartbeat"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local apiToken "mtk_241ca9a5_cb1f8255"
:local version [/system resource get version]
:local uptime [/system resource get uptime]
:local jsonData "{\"mikrotik_id\":\"$mikrotikId\",\"token\":\"$apiToken\",\"version\":\"$version\",\"uptime\":\"$uptime\"}"
:log info "=== HEARTBEAT INICIADO ==="
:do {
    /tool fetch url=$apiUrl http-method=post http-header-field="Content-Type:application/json" http-data=$jsonData
    :log info "Heartbeat enviado com sucesso"
} on-error={
    :log error "Erro ao enviar heartbeat: $!"
}
:log info "=== HEARTBEAT CONCLUIDO ===" 