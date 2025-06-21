:local apiBaseUrl "https://api.lucro.top"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"
:local apiToken "API_Access_2024_Strong_Token_P4uQ9wE6rT2yU1iO"

:local logMsg do={
    :log info ("[CLEANUP] " . $1)
    :put ("[CLEANUP] " . $1)
}

$logMsg "Iniciando limpeza"

:local notifyAPI do={
    :local macAddress $1
    :local action $2
    :local postData "{\"token\":\"$authToken\",\"mac_address\":\"$macAddress\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"$action\"}"
    :local url "$apiBaseUrl/api/mikrotik/auth-notification"
    :do {
        /tool fetch url=$url http-method=post http-header-field="Authorization: Bearer $apiToken,Content-Type: application/json" http-data=$postData
        $logMsg "API notificada: $macAddress - $action"
    } on-error={
        $logMsg "ERRO: Notificacao $macAddress"
    }
}

:local currentTime [/system clock get time]
:local currentHour [:tonum [:pick $currentTime 0 [:find $currentTime ":"]]]
:local currentMin [:tonum [:pick $currentTime 3 5]]
:local currentSec [:tonum [:pick $currentTime 6 8]]
:local currentTotalSeconds (($currentHour * 3600) + ($currentMin * 60) + $currentSec)

$logMsg "Tempo atual: $currentTime"

:local bindingsRemovedCount 0

:foreach binding in=[/ip hotspot ip-binding find comment~"PIX-"] do={
    :local macAddress [/ip hotspot ip-binding get $binding mac-address]
    :local comment [/ip hotspot ip-binding get $binding comment]
    
    :if ([:find $comment "PIX-"] >= 0) do={
        :local schedulerName "rem-$macAddress"
        :local schedulerExists false
        
        :do {
            :local schedulerInfo [/system scheduler get [find name=$schedulerName]]
            :set schedulerExists true
            
            :local startTime [/system scheduler get [find name=$schedulerName] start-time]
            :local startHour [:tonum [:pick $startTime 0 [:find $startTime ":"]]]
            :local startMin [:tonum [:pick $startTime 3 5]]
            :local startSec [:tonum [:pick $startTime 6 8]]
            :local startTotalSeconds (($startHour * 3600) + ($startMin * 60) + $startSec)
            
            :if ($currentTotalSeconds >= $startTotalSeconds) do={
                $logMsg "Binding expirado: $macAddress"
                
                :do {
                    /ip hotspot ip-binding remove $binding
                    $logMsg "Binding removido: $macAddress"
                    :set bindingsRemovedCount ($bindingsRemovedCount + 1)
                    $notifyAPI $macAddress "disconnect"
                } on-error={
                    $logMsg "ERRO: Falha remover binding $macAddress"
                }
                
                :do {
                    /system scheduler remove [find name=$schedulerName]
                    $logMsg "Scheduler removido: $schedulerName"
                } on-error={
                    $logMsg "ERRO: Falha remover scheduler $schedulerName"
                }
            } else={
                :local remainingSeconds ($startTotalSeconds - $currentTotalSeconds)
                :local remainingMinutes ($remainingSeconds / 60)
                $logMsg "Binding $macAddress valido (resta $remainingMinutes min)"
            }
            
        } on-error={
            $logMsg "Binding orfao: $macAddress"
        }
    }
}

:local schedulersRemovedCount 0

:foreach scheduler in=[/system scheduler find comment~"AUTO-"] do={
    :local schedulerName [/system scheduler get $scheduler name]
    :local comment [/system scheduler get $scheduler comment]
    
    :if ([:find $schedulerName "rem-"] = 0) do={
        :local macFromScheduler [:pick $schedulerName 4 [:len $schedulerName]]
        
        :local bindingExists false
        :do {
            :local bindingInfo [/ip hotspot ip-binding get [find mac-address=$macFromScheduler]]
            :set bindingExists true
        } on-error={
            :set bindingExists false
        }
        
        :if (!$bindingExists) do={
            $logMsg "Scheduler orfao: $schedulerName"
            :do {
                /system scheduler remove $scheduler
                $logMsg "Scheduler orfao removido: $schedulerName"
                :set schedulersRemovedCount ($schedulersRemovedCount + 1)
            } on-error={
                $logMsg "ERRO: Falha remover scheduler orfao $schedulerName"
            }
        }
    }
}

$logMsg "Limpeza concluida"
$logMsg "Bindings removidos: $bindingsRemovedCount"
$logMsg "Schedulers orfaos removidos: $schedulersRemovedCount"

:local totalBindings [:len [/ip hotspot ip-binding find comment~"PIX-"]]
:local totalSchedulers [:len [/system scheduler find comment~"AUTO-"]]

$logMsg "Bindings ativos: $totalBindings"
$logMsg "Schedulers ativos: $totalSchedulers" 