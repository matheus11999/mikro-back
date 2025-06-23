# ====================================================
# SCRIPT MIKROTIK - HEARTBEAT MONITOR
# ====================================================
# Envia heartbeat para monitoramento online/offline
# Obtém dados via /system resource print
# Executa automaticamente a cada 5 minutos
# ====================================================

# CONFIGURAÇÕES - ALTERE AQUI SEUS DADOS
:local apiBaseUrl "https://api.lucro.top"
:local mikrotikId "SEU-MIKROTIK-ID-AQUI"
:local heartbeatToken "MkT_Heartbeat_2024_Secure_Token_H7bQ9wE2rT3yU8iP"

# Função para log com timestamp
:local logMsg do={
    :local message $1
    :log info ("[HEARTBEAT] " . $message)
    :put ("[HEARTBEAT] " . $message)
}

$logMsg "=== INICIANDO HEARTBEAT MONITOR ==="

# Função para fazer requisição HTTP
:local sendHeartbeat do={
    :local apiUrl $1
    :local mikrotikId $2
    :local token $3
    :local version $4
    :local uptime $5
    
    :local payload "{\"mikrotik_id\":\"$mikrotikId\",\"token\":\"$token\",\"version\":\"$version\",\"uptime\":\"$uptime\"}"
    :local url "$apiUrl/api/mikrotik/heartbeat"
    
    $logMsg "Enviando heartbeat para API..."
    $logMsg "URL: $url"
    $logMsg "Payload: $payload"
    
    :do {
        /tool fetch url=$url http-method=post http-header-field="Content-Type: application/json" http-data=$payload
        $logMsg "Heartbeat enviado com sucesso!"
        :return true
    } on-error={
        $logMsg "ERRO: Falha ao enviar heartbeat"
        :return false
    }
}

# Obter informações do sistema via /system resource print
$logMsg "Obtendo informações do sistema..."

:local systemInfo ""
:local resourceVersion ""
:local resourceUptime ""

# Capturar saída do /system resource print
:do {
    :set systemInfo [/system resource print as-value]
    $logMsg "Informações obtidas com sucesso"
} on-error={
    $logMsg "ERRO: Falha ao obter informações do sistema"
    :error "Falha ao executar /system resource print"
}

# Extrair version
:do {
    :set resourceVersion ($systemInfo->"version")
    $logMsg "Version obtida: $resourceVersion"
} on-error={
    $logMsg "ERRO: Falha ao extrair version"
    :set resourceVersion "unknown"
}

# Extrair uptime
:do {
    :set resourceUptime ($systemInfo->"uptime")
    $logMsg "Uptime obtido: $resourceUptime"
} on-error={
    $logMsg "ERRO: Falha ao extrair uptime"
    :set resourceUptime "unknown"
}

# Validar se obteve as informações
:if ($resourceVersion = "" or $resourceUptime = "") do={
    $logMsg "AVISO: Version ou uptime estão vazios"
    :if ($resourceVersion = "") do={ :set resourceVersion "unknown" }
    :if ($resourceUptime = "") do={ :set resourceUptime "unknown" }
}

# Enviar heartbeat para API
$logMsg "Preparando envio do heartbeat..."
$logMsg "MikroTik ID: $mikrotikId"
$logMsg "Version: $resourceVersion"
$logMsg "Uptime: $resourceUptime"

:local sucesso [$sendHeartbeat $apiBaseUrl $mikrotikId $heartbeatToken $resourceVersion $resourceUptime]

:if ($sucesso) do={
    $logMsg "Heartbeat enviado com sucesso!"
} else={
    $logMsg "Falha no envio do heartbeat"
}

$logMsg "=== HEARTBEAT MONITOR CONCLUÍDO ==="

# ====================================================
# CONFIGURAÇÃO DO SCHEDULER
# ====================================================
# Para configurar o script para executar a cada 5 minutos,
# execute estes comandos no terminal do MikroTik:
#
# 1. Criar o script (cole todo este código):
# /system script add name=heartbeat-monitor source="<COLE-TODO-O-CODIGO-AQUI>"
#
# 2. Criar scheduler para executar a cada 5 minutos:
# /system scheduler add name=heartbeat-auto start-time=startup interval=5m on-event=heartbeat-monitor comment="Heartbeat automatico a cada 5 minutos"
#
# 3. Para testar manualmente:
# /system script run heartbeat-monitor
#
# 4. Para verificar logs:
# /log print where topics~"script"
#
# ====================================================

# EXEMPLO DE CONFIGURAÇÃO COMPLETA:
# 1. Substitua "SEU-MIKROTIK-ID-AQUI" pelo ID real do seu MikroTik
# 2. Ajuste a URL da API se necessário
# 3. Execute o script manualmente primeiro para testar
# 4. Configure o scheduler para automação

# FORMATO ESPERADO DOS DADOS:
# version: "7.12 (stable)" ou similar
# uptime: "1d12h33m20s" ou similar

# MONITORAMENTO:
# - O script registra logs detalhados
# - Verifique /log print para debug
# - API retorna status do heartbeat
# - Frontend mostra status online/offline baseado nos heartbeats 