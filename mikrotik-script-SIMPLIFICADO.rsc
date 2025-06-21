# ======================================================
# SCRIPT MIKROTIK SIMPLIFICADO - SEM SISTEMA DE SENHAS
# ======================================================
# Este script funciona apenas com MACs e minutos de acesso
# Sem usuários/senhas - controle direto por IP binding
# ======================================================

# Configurações principais
:local apiBaseUrl "https://api.lucro.top"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "mikrotik-secure-token-2024"
:local apiToken "api-secure-token-2024"

# Função para log com timestamp
:local logMsg do={
    :local message $1
    :log info ("[PIX-SCRIPT] " . $message)
    :put ("[PIX-SCRIPT] " . $message)
}

$logMsg "=== INICIANDO SCRIPT SIMPLIFICADO ==="

# Função para fazer requisições HTTP com token
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

# Função para notificar API sobre mudanças de status
:local notifyAPI do={
    :local macAddress $1
    :local action $2
    
    :local postData "{\"token\":\"$authToken\",\"mac_address\":\"$macAddress\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"$action\"}"
    :local url "$apiBaseUrl/api/mikrotik/auth-notification"
    
    :do {
        :local response [$httpRequest $url "POST" $apiToken $postData]
        $logMsg "Notificação enviada: MAC $macAddress - Action: $action"
    } on-error={
        $logMsg "ERRO: Falha ao notificar API para MAC $macAddress"
    }
}

# 1. BUSCAR VENDAS RECENTES DA API
$logMsg "Consultando vendas recentes da API..."

:local vendasUrl "$apiBaseUrl/api/recent-sales/$mikrotikId"
:local vendas ""

:do {
    :local response [$httpRequest $vendasUrl "GET" $apiToken ""]
    :if (($response->"status") = "finished") do={
        :set vendas ($response->"data")
        $logMsg "Dados recebidos da API com sucesso"
    } else={
        $logMsg "ERRO: Falha na requisição HTTP - Status: " . ($response->"status")
        :error "Falha na requisição"
    }
} on-error={
    $logMsg "ERRO: Não foi possível conectar à API"
    :error "Falha na conexão com API"
}

# 2. PROCESSAR DADOS JSON
:if ([:len $vendas] = 0) do={
    $logMsg "Nenhuma venda recente encontrada"
} else={
    $logMsg "Processando vendas recentes..."
    
    # Parse manual do JSON para extrair MAC e minutos
    :local startPos 0
    :local dataArray [:toarray ""]
    
    # Encontrar objetos JSON no array
    :while ([:find $vendas "{" $startPos] >= 0) do={
        :local objStart [:find $vendas "{" $startPos]
        :local objEnd [:find $vendas "}" $objStart]
        
        :if ($objEnd >= 0) do={
            :local objStr [:pick $vendas $objStart ($objEnd + 1)]
            
            # Extrair MAC
            :local macStart [:find $objStr "\"mac\":\""]
            :if ($macStart >= 0) do={
                :set macStart ($macStart + 7)
                :local macEnd [:find $objStr "\"" $macStart]
                :local macAddress [:pick $objStr $macStart $macEnd]
                
                # Extrair minutos
                :local minStart [:find $objStr "\"minutos\":"]
                :if ($minStart >= 0) do={
                    :set minStart ($minStart + 10)
                    :local minEnd [:find $objStr "}" $minStart]
                    :if ($minEnd < 0) do={ :set minEnd [:find $objStr "," $minStart] }
                    :local minutosStr [:pick $objStr $minStart $minEnd]
                    :local minutos [:tonum $minutosStr]
                    
                    # Adicionar à lista de processamento
                    :set dataArray ($dataArray, {mac=$macAddress; minutos=$minutos})
                    $logMsg "Encontrado: MAC $macAddress com $minutos minutos"
                }
            }
        }
        
        :set startPos ($objEnd + 1)
    }
    
    # 3. PROCESSAR CADA VENDA
    :foreach item in=$dataArray do={
        :local macAddress ($item->"mac")
        :local minutos ($item->"minutos")
        :local tempoExpiracao ($minutos * 60)
        
        $logMsg "Processando MAC: $macAddress ($minutos minutos)"
        
        # Remover binding anterior se existir
        :do {
            /ip hotspot ip-binding remove [find mac-address=$macAddress]
            $logMsg "Binding anterior removido para $macAddress"
        } on-error={}
        
        # Remover usuários trial se existirem
        :do {
            /ip hotspot user remove [find mac-address=$macAddress]
            $logMsg "Usuário trial removido para $macAddress"
        } on-error={}
        
        # Criar novo IP binding (bypass)
        :do {
            /ip hotspot ip-binding add mac-address=$macAddress type=bypassed comment="PIX-AUTO-$macAddress-$minutos"
            $logMsg "IP Binding criado para $macAddress"
            
            # Notificar API que o MAC foi conectado
            $notifyAPI $macAddress "connect"
            
        } on-error={
            $logMsg "ERRO: Falha ao criar binding para $macAddress"
        }
        
        # Criar scheduler para remoção automática
        :local schedulerName "remove-$macAddress"
        :local schedulerTime [:tostr [/system clock get time]]
        :local currentDate [/system clock get date]
        
        # Calcular tempo de expiração
        :local currentTime [/system clock get time]
        :local timeArray [:toarray [:pick $currentTime 0 [:find $currentTime ":"]]]
        :local currentHour [:tonum [:pick $currentTime 0 [:find $currentTime ":"]]]
        :local currentMin [:tonum [:pick $currentTime 3 5]]
        :local currentSec [:tonum [:pick $currentTime 6 8]]
        
        :local totalSeconds (($currentHour * 3600) + ($currentMin * 60) + $currentSec + $tempoExpiracao)
        :local expHour ($totalSeconds / 3600)
        :local expMin (($totalSeconds % 3600) / 60)
        :local expSec ($totalSeconds % 60)
        
        :if ($expHour >= 24) do={
            :set expHour ($expHour - 24)
            # Para simplicidade, assumimos que não vai passar de 1 dia
        }
        
        :local expTime ([:tostr $expHour] . ":" . [:tostr $expMin] . ":" . [:tostr $expSec])
        
        # Criar comando de remoção
        :local removeCommand "/ip hotspot ip-binding remove [find mac-address=$macAddress]; /tool fetch url=\"$apiBaseUrl/api/mikrotik/auth-notification\" http-method=post http-header-field=\"Authorization: Bearer $apiToken,Content-Type: application/json\" http-data=\"{\\\"token\\\":\\\"$authToken\\\",\\\"mac_address\\\":\\\"$macAddress\\\",\\\"mikrotik_id\\\":\\\"$mikrotikId\\\",\\\"action\\\":\\\"disconnect\\\"}\"; /system scheduler remove [find name=\"$schedulerName\"]"
        
        # Remover scheduler anterior se existir
        :do {
            /system scheduler remove [find name=$schedulerName]
        } on-error={}
        
        # Criar novo scheduler
        :do {
            /system scheduler add name=$schedulerName start-time=$expTime interval=0 on-event=$removeCommand comment="AUTO-REMOVE-$macAddress"
            $logMsg "Scheduler criado: $schedulerName para remoção às $expTime"
        } on-error={
            $logMsg "ERRO: Falha ao criar scheduler para $macAddress"
        }
    }
}

$logMsg "=== SCRIPT CONCLUÍDO ===" 