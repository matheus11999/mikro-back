# =======================================================
# SCRIPT DE HEARTBEAT MIKROTIK - VERSÃO FUNCIONANDO
# =======================================================
# Este script coleta informações do sistema e envia para a API
# Execute: /system script run heartbeat-lucro
# =======================================================

# CONFIGURAÇÕES - ALTERE AQUI
:local apiUrl "https://api.lucro.top/api/mikrotik/heartbeat"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local apiToken "mtk_241ca9a5_cb1f8255"

# Função para log
:local logPrefix "[HEARTBEAT]"

:put "$logPrefix Iniciando heartbeat..."

# Capturar informações do sistema
:local systemInfo
:local version ""
:local uptime ""

:do {
    :set systemInfo [/system resource print as-value]
    
    # Extrair versão
    :if ([:len $systemInfo] > 0) do={
        :set version ($systemInfo->0->"version")
        :set uptime ($systemInfo->0->"uptime")
    }
    
    :put "$logPrefix Versão: $version"
    :put "$logPrefix Uptime: $uptime"
    
} on-error={
    :put "$logPrefix ERRO ao capturar informações do sistema"
    :set version "erro-captura"
    :set uptime "erro-captura"
}

# Preparar dados para envio
:local postData "{\"mikrotik_id\":\"$mikrotikId\",\"token\":\"$apiToken\",\"version\":\"$version\",\"uptime\":\"$uptime\"}"

:put "$logPrefix Enviando dados: $postData"

# Enviar heartbeat
:do {
    :local result [/tool fetch url=$apiUrl http-method=post http-header-field="Content-Type:application/json" http-data=$postData as-value]
    
    :if ($result->"status" = "finished") do={
        :put "$logPrefix Heartbeat enviado com sucesso!"
        :put "$logPrefix Status: $($result->\"status\")"
    } else={
        :put "$logPrefix ERRO: Status não é 'finished': $($result->\"status\")"
    }
    
} on-error={
    :put "$logPrefix ERRO ao enviar heartbeat para API"
    :put "$logPrefix URL: $apiUrl"
    :put "$logPrefix Dados: $postData"
}

:put "$logPrefix Heartbeat finalizado." 