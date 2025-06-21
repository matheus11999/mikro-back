# ======================================================
# SCRIPT DE LIMPEZA MIKROTIK SIMPLIFICADO
# ======================================================
# Remove bindings expirados e notifica a API
# Trabalha apenas com MACs - sem sistema de senhas
# ======================================================

# Configurações principais
:local apiBaseUrl "https://api.lucro.top"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "mikrotik-secure-token-2024"
:local apiToken "api-secure-token-2024"

# Função para log com timestamp
:local logMsg do={
    :local message $1
    :log info ("[CLEANUP] " . $message)
    :put ("[CLEANUP] " . $message)
}

$logMsg "=== INICIANDO LIMPEZA AUTOMÁTICA ==="

# Função para notificar API sobre mudanças de status
:local notifyAPI do={
    :local macAddress $1
    :local action $2
    
    :local postData "{\"token\":\"$authToken\",\"mac_address\":\"$macAddress\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"$action\"}"
    :local url "$apiBaseUrl/api/mikrotik/auth-notification"
    
    :do {
        /tool fetch url=$url http-method=post http-header-field="Authorization: Bearer $apiToken,Content-Type: application/json" http-data=$postData
        $logMsg "API notificada: MAC $macAddress - Action: $action"
    } on-error={
        $logMsg "ERRO: Falha ao notificar API para MAC $macAddress"
    }
}

# Obter tempo atual
:local currentTime [/system clock get time]
:local currentHour [:tonum [:pick $currentTime 0 [:find $currentTime ":"]]]
:local currentMin [:tonum [:pick $currentTime 3 5]]
:local currentSec [:tonum [:pick $currentTime 6 8]]
:local currentTotalSeconds (($currentHour * 3600) + ($currentMin * 60) + $currentSec)

$logMsg "Tempo atual: $currentTime (Total segundos: $currentTotalSeconds)"

# 1. VERIFICAR E REMOVER BINDINGS EXPIRADOS
$logMsg "Verificando IP bindings..."

:local bindingsRemovedCount 0

:foreach binding in=[/ip hotspot ip-binding find comment~"PIX-AUTO-"] do={
    :local macAddress [/ip hotspot ip-binding get $binding mac-address]
    :local comment [/ip hotspot ip-binding get $binding comment]
    
    $logMsg "Verificando binding: $macAddress - $comment"
    
    # Extrair informações do comentário
    :if ([:find $comment "PIX-AUTO-"] >= 0) do={
        # Buscar scheduler correspondente para verificar se ainda está ativo
        :local schedulerName "remove-$macAddress"
        :local schedulerExists false
        
        :do {
            :local schedulerInfo [/system scheduler get [find name=$schedulerName]]
            :set schedulerExists true
            
            # Verificar se o scheduler já deveria ter executado
            :local startTime [/system scheduler get [find name=$schedulerName] start-time]
            
            # Converter start-time para segundos
            :local startHour [:tonum [:pick $startTime 0 [:find $startTime ":"]]]
            :local startMin [:tonum [:pick $startTime 3 5]]
            :local startSec [:tonum [:pick $startTime 6 8]]
            :local startTotalSeconds (($startHour * 3600) + ($startMin * 60) + $startSec)
            
            $logMsg "Scheduler $schedulerName: start-time=$startTime ($startTotalSeconds segundos)"
            
            # Se o tempo atual passou do tempo de expiração
            :if ($currentTotalSeconds >= $startTotalSeconds) do={
                $logMsg "Binding expirado encontrado: $macAddress"
                
                # Remover binding
                :do {
                    /ip hotspot ip-binding remove $binding
                    $logMsg "Binding removido: $macAddress"
                    :set bindingsRemovedCount ($bindingsRemovedCount + 1)
                    
                    # Notificar API sobre desconexão
                    $notifyAPI $macAddress "disconnect"
                    
                } on-error={
                    $logMsg "ERRO: Falha ao remover binding $macAddress"
                }
                
                # Remover scheduler correspondente
                :do {
                    /system scheduler remove [find name=$schedulerName]
                    $logMsg "Scheduler removido: $schedulerName"
                } on-error={
                    $logMsg "ERRO: Falha ao remover scheduler $schedulerName"
                }
            } else={
                :local remainingSeconds ($startTotalSeconds - $currentTotalSeconds)
                :local remainingMinutes ($remainingSeconds / 60)
                $logMsg "Binding $macAddress ainda válido (resta $remainingMinutes minutos)"
            }
            
        } on-error={
            # Se não existe scheduler, o binding pode estar órfão
            $logMsg "AVISO: Binding órfão encontrado (sem scheduler): $macAddress"
            
            # Opcional: remover bindings órfãos sem scheduler
            # Descomente as linhas abaixo se quiser remover bindings órfãos automaticamente
            # :do {
            #     /ip hotspot ip-binding remove $binding
            #     $logMsg "Binding órfão removido: $macAddress"
            #     $notifyAPI $macAddress "disconnect"
            #     :set bindingsRemovedCount ($bindingsRemovedCount + 1)
            # } on-error={}
        }
    }
}

# 2. LIMPAR SCHEDULERS ÓRFÃOS
$logMsg "Verificando schedulers órfãos..."

:local schedulersRemovedCount 0

:foreach scheduler in=[/system scheduler find comment~"AUTO-REMOVE-"] do={
    :local schedulerName [/system scheduler get $scheduler name]
    :local comment [/system scheduler get $scheduler comment]
    
    # Extrair MAC do nome do scheduler
    :if ([:find $schedulerName "remove-"] = 0) do={
        :local macFromScheduler [:pick $schedulerName 7 [:len $schedulerName]]
        
        # Verificar se ainda existe binding correspondente
        :local bindingExists false
        :do {
            :local bindingInfo [/ip hotspot ip-binding get [find mac-address=$macFromScheduler]]
            :set bindingExists true
        } on-error={
            :set bindingExists false
        }
        
        :if (!$bindingExists) do={
            $logMsg "Scheduler órfão encontrado: $schedulerName (MAC: $macFromScheduler)"
            
            :do {
                /system scheduler remove $scheduler
                $logMsg "Scheduler órfão removido: $schedulerName"
                :set schedulersRemovedCount ($schedulersRemovedCount + 1)
            } on-error={
                $logMsg "ERRO: Falha ao remover scheduler órfão $schedulerName"
            }
        }
    }
}

# 3. ESTATÍSTICAS FINAIS
$logMsg "=== LIMPEZA CONCLUÍDA ==="
$logMsg "Bindings removidos: $bindingsRemovedCount"
$logMsg "Schedulers órfãos removidos: $schedulersRemovedCount"

# 4. ESTATÍSTICAS ATUAIS
:local totalBindings [:len [/ip hotspot ip-binding find comment~"PIX-AUTO-"]]
:local totalSchedulers [:len [/system scheduler find comment~"AUTO-REMOVE-"]]

$logMsg "Bindings ativos restantes: $totalBindings"
$logMsg "Schedulers ativos restantes: $totalSchedulers" 