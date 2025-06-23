# Script: Heartbeat MikroTik - Com Token Individual
# Descrição: Envia heartbeat para monitoramento online/offline
# Execução: A cada 5 minutos via scheduler

:local apiUrl "https://api.lucro.top/api/mikrotik/heartbeat"
:local mikrotikId "MIKROTIK_ID_AQUI"
:local apiToken "API_TOKEN_AQUI"

# Obter informações do sistema
:local version [/system resource get version]
:local uptime [/system resource get uptime]

# Preparar dados JSON
:local jsonData "{\"mikrotik_id\":\"$mikrotikId\",\"token\":\"$apiToken\",\"version\":\"$version\",\"uptime\":\"$uptime\"}"

:log info "=== HEARTBEAT INICIADO ==="
:log info "MikroTik ID: $mikrotikId"
:log info "Version: $version"
:log info "Uptime: $uptime"

# Enviar heartbeat
:do {
    /tool fetch url=$apiUrl \
        http-method=post \
        http-header-field="Content-Type:application/json" \
        http-data=$jsonData
    
    :log info "Heartbeat enviado com sucesso"
    
} on-error={
    :log error "Erro ao enviar heartbeat: $!"
}

:log info "=== HEARTBEAT CONCLUIDO ===" 