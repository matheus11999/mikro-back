:local apiBaseUrl "https://api.lucro.top"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"
:local apiToken "API_Access_2024_Strong_Token_P4uQ9wE6rT2yU1iO"

:local logMsg do={
    :log info ("[PIX] " . $1)
    :put ("[PIX] " . $1)
}

$logMsg "Iniciando script simplificado"

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
        $logMsg "ERRO: Notificacao falhou para $macAddress"
    }
}

$logMsg "Consultando vendas recentes"

:local vendasUrl "$apiBaseUrl/api/recent-sales/$mikrotikId"
:local vendas ""

:do {
    :local response [$httpRequest $vendasUrl "GET" $apiToken ""]
    :if (($response->"status") = "finished") do={
        :set vendas ($response->"data")
        $logMsg "Dados recebidos da API"
    } else={
        $logMsg "ERRO: Falha HTTP - " . ($response->"status")
        :error "Falha na requisicao"
    }
} on-error={
    $logMsg "ERRO: Conexao com API falhou"
    :error "Falha na conexao"
}

:if ([:len $vendas] = 0) do={
    $logMsg "Nenhuma venda recente"
} else={
    $logMsg "Processando vendas"
    
    :local startPos 0
    :local dataArray [:toarray ""]
    
    :while ([:find $vendas "{" $startPos] >= 0) do={
        :local objStart [:find $vendas "{" $startPos]
        :local objEnd [:find $vendas "}" $objStart]
        
        :if ($objEnd >= 0) do={
            :local objStr [:pick $vendas $objStart ($objEnd + 1)]
            
            :local macStart [:find $objStr "\"mac\":\""]
            :if ($macStart >= 0) do={
                :set macStart ($macStart + 7)
                :local macEnd [:find $objStr "\"" $macStart]
                :local macAddress [:pick $objStr $macStart $macEnd]
                
                :local minStart [:find $objStr "\"minutos\":"]
                :if ($minStart >= 0) do={
                    :set minStart ($minStart + 10)
                    :local minEnd [:find $objStr "}" $minStart]
                    :if ($minEnd < 0) do={ :set minEnd [:find $objStr "," $minStart] }
                    :local minutosStr [:pick $objStr $minStart $minEnd]
                    :local minutos [:tonum $minutosStr]
                    
                    :set dataArray ($dataArray, {mac=$macAddress; minutos=$minutos})
                    $logMsg "MAC: $macAddress - $minutos min"
                }
            }
        }
        :set startPos ($objEnd + 1)
    }
    
    :foreach item in=$dataArray do={
        :local macAddress ($item->"mac")
        :local minutos ($item->"minutos")
        :local tempoExpiracao ($minutos * 60)
        
        $logMsg "Processando: $macAddress"
        
        :do {
            /ip hotspot ip-binding remove [find mac-address=$macAddress]
        } on-error={}
        
        :do {
            /ip hotspot user remove [find mac-address=$macAddress]
        } on-error={}
        
        :do {
            /ip hotspot ip-binding add mac-address=$macAddress type=bypassed comment="PIX-$macAddress-$minutos"
            $logMsg "Binding criado: $macAddress"
            $notifyAPI $macAddress "connect"
        } on-error={
            $logMsg "ERRO: Falha binding $macAddress"
        }
        
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
        
        :local removeCmd "/ip hotspot ip-binding remove [find mac-address=$macAddress]; /tool fetch url=\"$apiBaseUrl/api/mikrotik/auth-notification\" http-method=post http-header-field=\"Authorization: Bearer $apiToken,Content-Type: application/json\" http-data=\"{\\\"token\\\":\\\"$authToken\\\",\\\"mac_address\\\":\\\"$macAddress\\\",\\\"mikrotik_id\\\":\\\"$mikrotikId\\\",\\\"action\\\":\\\"disconnect\\\"}\"; /system scheduler remove [find name=\"$schedulerName\"]"
        
        :do { /system scheduler remove [find name=$schedulerName] } on-error={}
        
        :do {
            /system scheduler add name=$schedulerName start-time=$expTime interval=0 on-event=$removeCmd comment="AUTO-$macAddress"
            $logMsg "Scheduler: $schedulerName -> $expTime"
        } on-error={
            $logMsg "ERRO: Scheduler $macAddress"
        }
    }
}

$logMsg "Script concluido" 