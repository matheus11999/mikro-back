# SCRIPT MIKROTIK - SISTEMA SEM SENHAS v3.0
# Compatível com formato mac-duração do recent-sales
# Funciona apenas com MAC addresses, sem usuários/senhas

:local apiBaseUrl "https://api.lucro.top"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"
:local apiToken "API_Access_2024_Strong_Token_P4uQ9wE6rT2yU1iO"

:local logMsg do={
    :log info ("[PIX-MAC] " . $1)
    :put ("[PIX-MAC] " . $1)
}

$logMsg "=== SCRIPT SEM SENHAS v3.0 INICIADO ==="

:local httpRequest do={
    :local url $1
    :local method $2
    :local token $3
    :local postData $4
    :local headers "Authorization: Bearer $token,Content-Type: application/json"
    :if ($method = "GET") do={
        :return [/tool fetch url="$url?token=$token" http-method=get http-header-field=$headers as-value]
    } else={
        :return [/tool fetch url=$url http-method=$method http-header-field=$headers http-data=$postData as-value]
    }
}

:local notifyAPI do={
    :local macAddress $1
    :local action $2
    :local postData "{\"token\":\"$authToken\",\"mac_address\":\"$macAddress\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"$action\"}"
    :local url "$apiBaseUrl/api/mikrotik/auth-notification"
    :do {
        :local response [$httpRequest $url "POST" $apiToken $postData]
        $logMsg "API notificada: $macAddress - $action"
    } on-error={
        $logMsg "ERRO: Notificacao API para $macAddress"
    }
}

$logMsg "Consultando vendas recentes (formato mac-duração)"

# Endpoint que retorna texto puro: mac-duração (uma linha por venda)
:local vendasUrl "$apiBaseUrl/api/recent-sales/$mikrotikId"
:local vendas ""

:do {
    :local response [$httpRequest $vendasUrl "GET" $apiToken ""]
    :if (($response->"status") = "finished") do={
        :set vendas ($response->"data")
        $logMsg "Dados recebidos da API (formato texto)"
    } else={
        $logMsg "ERRO: HTTP " . ($response->"status")
        :error "Falha HTTP"
    }
} on-error={
    $logMsg "ERRO: Falha na conexao com API"
    :error "Sem conexao"
}

:if ([:len $vendas] = 0) do={
    $logMsg "Nenhuma venda encontrada nos ultimos 2 min"
} else={
    $logMsg "Processando vendas (formato mac-duração)..."
    
    # Parser para formato texto: mac-duração (uma linha por venda)
    :local lines [:toarray ""]
    :local startPos 0
    
    # Dividir por linhas (\n)
    :while ([:find $vendas "\n" $startPos] >= 0 || $startPos < [:len $vendas]) do={
        :local lineEnd [:find $vendas "\n" $startPos]
        :if ($lineEnd < 0) do={ :set lineEnd [:len $vendas] }
        
        :local line [:pick $vendas $startPos $lineEnd]
        :if ([:len $line] > 0) do={
            :set lines ($lines, $line)
        }
        
        :set startPos ($lineEnd + 1)
    }
    
    # Processar cada linha: mac-duração
    :foreach line in=$lines do={
        :if ([:len $line] > 0) do={
            :local dashPos [:find $line "-"]
            :if ($dashPos >= 0) do={
                :local macAddress [:pick $line 0 $dashPos]
                :local minutosStr [:pick $line ($dashPos + 1) [:len $line]]
                :local minutos [:tonum $minutosStr]
                
                :if ([:len $macAddress] > 0 && $minutos > 0) do={
                    $logMsg "Encontrado: $macAddress ($minutos min)"
                    
                    :local tempoExpiracao ($minutos * 60)
                    
                    # Remove binding anterior se existir
                    :do {
                        /ip hotspot ip-binding remove [find mac-address=$macAddress]
                        $logMsg "Binding anterior removido: $macAddress"
                    } on-error={}
                    
                    # Remove user hotspot (limpeza)
                    :do {
                        /ip hotspot user remove [find mac-address=$macAddress]
                    } on-error={}
                    
                    # Cria novo IP binding (bypass)
                    :do {
                        /ip hotspot ip-binding add mac-address=$macAddress type=bypassed comment="PIX-$macAddress-$minutos"
                        $logMsg "Binding criado: $macAddress ($minutos min)"
                        $notifyAPI $macAddress "connect"
                    } on-error={
                        $logMsg "ERRO: Falha criar binding $macAddress"
                    }
                    
                    # Calcula horário de expiração
                    :local schedulerName "rem-$macAddress"
                    :local currentTime [/system clock get time]
                    :local currentHour [:tonum [:pick $currentTime 0 [:find $currentTime ":"]]]
                    :local currentMin [:tonum [:pick $currentTime 3 5]]
                    :local currentSec [:tonum [:pick $currentTime 6 8]]
                    
                    :local totalSeconds (($currentHour * 3600) + ($currentMin * 60) + $currentSec + $tempoExpiracao)
                    :local expHour ($totalSeconds / 3600)
                    :local expMin (($totalSeconds % 3600) / 60)
                    :local expSec ($totalSeconds % 60)
                    
                    :if ($expHour >= 24) do={ :set expHour ($expHour - 24) }
                    
                    :local expTime ([:tostr $expHour] . ":" . [:tostr $expMin] . ":" . [:tostr $expSec])
                    
                    # Comando para remover binding quando expirar
                    :local removeCmd "/ip hotspot ip-binding remove [find mac-address=$macAddress]; /tool fetch url=\"$apiBaseUrl/api/mikrotik/auth-notification\" http-method=post http-header-field=\"Authorization: Bearer $apiToken,Content-Type: application/json\" http-data=\"{\\\"token\\\":\\\"$authToken\\\",\\\"mac_address\\\":\\\"$macAddress\\\",\\\"mikrotik_id\\\":\\\"$mikrotikId\\\",\\\"action\\\":\\\"disconnect\\\"}\"; /system scheduler remove [find name=\"$schedulerName\"]"
                    
                    # Remove scheduler anterior
                    :do { /system scheduler remove [find name=$schedulerName] } on-error={}
                    
                    # Cria scheduler para remoção automática
                    :do {
                        /system scheduler add name=$schedulerName start-time=$expTime interval=0 on-event=$removeCmd comment="AUTO-$macAddress"
                        $logMsg "Scheduler: $schedulerName -> $expTime"
                    } on-error={
                        $logMsg "ERRO: Scheduler $macAddress"
                    }
                }
            }
        }
    }
}

$logMsg "=== SCRIPT CONCLUIDO ===" 