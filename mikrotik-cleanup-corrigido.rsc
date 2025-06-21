# Script de limpeza de bypass expirados com notificação da API
:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "mikrotik-secure-token-2024"

# Função para notificar desconexão na API
:local notificarDesconexao do={
    :local macAddress $1
    :local usuario $2
    :local authUrl $3
    :local mikrotikId $4
    :local authToken $5
    
    :log info ("[API] Notificando desconexao para usuario $usuario (MAC: $macAddress)")
    
    # Criar JSON payload
    :local jsonPayload "{\"token\":\"$authToken\",\"mac_address\":\"$macAddress\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"disconnect\",\"usuario\":\"$usuario\"}"
    
    # Fazer POST para notificar desconexão
    :do {
        /tool fetch url=$authUrl http-method=post http-header-field="Content-Type:application/json" http-data=$jsonPayload dst-path="cleanup_notify.txt"
        :delay 1s
        
        # Ler resposta (opcional)
        :local response ""
        :do {
            :set response [/file get [find name="cleanup_notify.txt"] contents]
            :log info ("[API] Desconexao notificada com sucesso para $usuario")
        } on-error={
            :log warning ("[API] Nao foi possivel ler resposta da notificacao para $usuario")
        }
        
        # Limpar arquivo de resposta
        :do { /file remove [find name="cleanup_notify.txt"] } on-error={}
        
    } on-error={
        :log error ("[API] ERRO ao notificar desconexao para $usuario (MAC: $macAddress)")
    }
}

:local agora [/system clock get time]
:local hoje [/system clock get date]
:local horaAtual [:tonum [:pick $agora 0 2]]
:local minutoAtual [:tonum [:pick $agora 3 5]]
:local minutosAtuais ($horaAtual * 60 + $minutoAtual)

:log info "=== INICIANDO LIMPEZA DE BYPASS EXPIRADOS ==="
:log info "[CLEANUP] Verificando bypass expirados - $hoje $agora (minutos atuais: $minutosAtuais)"

:local removidos 0
:local erros 0

:foreach binding in=[/ip hotspot ip-binding find where comment~"USER:" and comment~"EXPIRES:"] do={
    :local comentario [/ip hotspot ip-binding get $binding comment]
    :local macAddr [/ip hotspot ip-binding get $binding mac-address]
    
    # Extrair nome do usuário
    :local posUser [:find $comentario "USER:"]
    :local posCreated [:find $comentario "|CREATED:"]
    :local nomeUser ""
    :if ($posUser >= 0 and $posCreated >= 0) do={
        :set nomeUser [:pick $comentario ($posUser + 5) $posCreated]
    }
    
    # Extrair tempo de expiração
    :local posExpires [:find $comentario "EXPIRES:"]
    :local posDuration [:find $comentario "|DURATION:"]
    :if ($posExpires >= 0 and $posDuration >= 0) do={
        :local tempoExpiraStr [:pick $comentario ($posExpires + 8) $posDuration]
        :local posTraco [:find $tempoExpiraStr "-"]
        :if ($posTraco >= 0) do={
            :local dataExpira [:pick $tempoExpiraStr 0 $posTraco]
            :local horaExpira [:pick $tempoExpiraStr ($posTraco + 1) ([:len $tempoExpiraStr])]
            
            :log info ("[VERIFICACAO] Usuario: $nomeUser | MAC: $macAddr | Expira: $dataExpira $horaExpira")
            
            :if ($dataExpira = $hoje) do={
                :local horaExp [:tonum [:pick $horaExpira 0 2]]
                :local minutoExp [:tonum [:pick $horaExpira 3 5]]
                :local minutosExpira ($horaExp * 60 + $minutoExp)
                
                :log info ("[HORARIO] Atual: $minutosAtuais min | Expira: $minutosExpira min")
                
                :if ($minutosAtuais >= $minutosExpira) do={
                    :log warning "[CLEANUP] ⏰ Bypass expirado encontrado: $nomeUser (MAC: $macAddr)"
                    
                    # Tentar remover o IP binding
                    :local removeuBinding false
                    :do {
                        /ip hotspot ip-binding remove $binding
                        :log info ("[CLEANUP] ✓ IP Binding removido: $nomeUser (MAC: $macAddr)")
                        :set removeuBinding true
                        :set removidos ($removidos + 1)
                    } on-error={
                        :log error ("[CLEANUP] ✗ Erro ao remover IP Binding: $nomeUser (MAC: $macAddr)")
                        :set erros ($erros + 1)
                        :set removeuBinding false
                    }
                    
                    # Se removeu o binding com sucesso, notificar a API
                    :if ($removeuBinding) do={
                        $notificarDesconexao $macAddr $nomeUser $authUrl $mikrotikId $authToken
                    }
                    
                    # Remover agendamento relacionado (se existir)
                    :do {
                        :local schedulerName ("expire-" . $nomeUser)
                        :local schedulers [/system scheduler find where name=$schedulerName]
                        :if ([:len $schedulers] > 0) do={
                            /system scheduler remove $schedulers
                            :log info ("[CLEANUP] ✓ Agendamento removido: $schedulerName")
                        }
                    } on-error={
                        :log warning ("[CLEANUP] Erro ao remover agendamento para $nomeUser")
                    }
                } else={
                    :local minutosRestantes ($minutosExpira - $minutosAtuais)
                    :log info ("[ATIVO] $nomeUser ainda ativo - expira em $minutosRestantes minutos")
                }
            } else={
                :log info ("[DATA] $nomeUser expira em data diferente: $dataExpira (hoje: $hoje)")
            }
        } else={
            :log warning ("[FORMATO] Formato de data/hora inválido no comentário: $comentario")
        }
    } else={
        :log warning ("[COMENTARIO] Comentário sem campos EXPIRES ou DURATION: $comentario")
    }
}

# Log final com estatísticas
:log info "=== LIMPEZA CONCLUIDA ==="
:log info ("[RESUMO] Bypass removidos: $removidos | Erros: $erros")
:if ($removidos > 0) do={
    :log info ("[RESUMO] $removidos bypass expirados foram removidos e notificados na API")
} else={
    :log info ("[RESUMO] Nenhum bypass expirado encontrado")
}
:log info "==================================" 