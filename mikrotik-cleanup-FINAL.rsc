# Script de limpeza com notificação da API - FUNCIONAL
:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "mikrotik-secure-token-2024"

# Função para notificar desconexão na API
:local notificarAPI do={
    :local macAddress $1
    :local usuario $2
    :local authUrl $3
    :local mikrotikId $4
    :local authToken $5
    
    :put ("[API] Notificando desconexao: $usuario (MAC: $macAddress)")
    
    # Criar JSON payload
    :local jsonPayload "{\"token\":\"$authToken\",\"mac_address\":\"$macAddress\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"disconnect\",\"usuario\":\"$usuario\"}"
    
    # Fazer POST para API
    :do {
        /tool fetch url=$authUrl http-method=post http-header-field="Content-Type:application/json" http-data=$jsonPayload dst-path="disconnect_notify.txt"
        :delay 1s
        
        # Ler resposta
        :local response ""
        :do {
            :set response [/file get [find name="disconnect_notify.txt"] contents]
            :put ("[API] Resposta: OK")
        } on-error={
            :put ("[API] Nao foi possivel ler resposta")
        }
        
        # Limpar arquivo
        :do { /file remove [find name="disconnect_notify.txt"] } on-error={}
        
    } on-error={
        :put ("[API] ERRO ao notificar desconexao")
    }
}

# Obter hora atual em minutos
:local agora [/system clock get time]
:local hoje [/system clock get date]
:local horaAtual [:tonum [:pick $agora 0 2]]
:local minutoAtual [:tonum [:pick $agora 3 5]]
:local minutosAtuais ($horaAtual * 60 + $minutoAtual)

:put "=== LIMPEZA DE BYPASS EXPIRADOS ==="
:put ("Verificando em: " . $hoje . " " . $agora . " (" . $minutosAtuais . " min)")

:local removidos 0

# Processar todos os bindings com comentário USER: e EXPIRES:
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
        :local tempoExpira [:pick $comentario ($posExpires + 8) $posDuration]
        
        :put ("Verificando: " . $nomeUser . " (MAC: " . $macAddr . ")")
        :put ("  Expira em: " . $tempoExpira)
        
        # Extrair data e hora de expiração (formato: 2025-06-21-17:03:00)
        # Encontrar último "-" para separar data da hora
        :local ultimoTraco -1
        :local i 0
        :while ($i < [:len $tempoExpira]) do={
            :local char [:pick $tempoExpira $i ($i+1)]
            :if ($char = "-") do={ :set ultimoTraco $i }
            :set i ($i + 1)
        }
        
        :if ($ultimoTraco >= 0) do={
            :local dataExpira [:pick $tempoExpira 0 $ultimoTraco]
            :local horaExpira [:pick $tempoExpira ($ultimoTraco + 1) [:len $tempoExpira]]
            
            # Converter data atual para formato 2025-06-21
            :local dataHoje ""
            # Assumindo formato de data jun/21/2025
            :local pos1 [:find $hoje "/"]
            :local pos2 [:find $hoje "/" ($pos1 + 1)]
            :if ($pos1 >= 0 and $pos2 >= 0) do={
                :local mes [:pick $hoje 0 $pos1]
                :local dia [:pick $hoje ($pos1 + 1) $pos2]
                :local ano [:pick $hoje ($pos2 + 1) [:len $hoje]]
                
                # Converter mês
                :local mesNum "00"
                :if ($mes = "jan") do={ :set mesNum "01" }
                :if ($mes = "feb") do={ :set mesNum "02" }
                :if ($mes = "mar") do={ :set mesNum "03" }
                :if ($mes = "apr") do={ :set mesNum "04" }
                :if ($mes = "may") do={ :set mesNum "05" }
                :if ($mes = "jun") do={ :set mesNum "06" }
                :if ($mes = "jul") do={ :set mesNum "07" }
                :if ($mes = "aug") do={ :set mesNum "08" }
                :if ($mes = "sep") do={ :set mesNum "09" }
                :if ($mes = "oct") do={ :set mesNum "10" }
                :if ($mes = "nov") do={ :set mesNum "11" }
                :if ($mes = "dec") do={ :set mesNum "12" }
                
                # Formatar dia
                :if ([:len $dia] = 1) do={ :set dia ("0" . $dia) }
                
                :set dataHoje ($ano . "-" . $mesNum . "-" . $dia)
            }
            
            # Verificar se deve remover
            :local deveRemover false
            
            :if ($dataExpira < $dataHoje) do={
                # Data anterior - já expirou
                :set deveRemover true
                :put ("  Status: EXPIRADO (data anterior)")
            } else={
                :if ($dataExpira = $dataHoje) do={
                    # Mesma data - verificar hora
                    :local pos [:find $horaExpira ":"]
                    :if ($pos >= 0) do={
                        :local horaExp [:tonum [:pick $horaExpira 0 $pos]]
                        :local resto [:pick $horaExpira ($pos + 1) [:len $horaExpira]]
                        :local pos2 [:find $resto ":"]
                        :local minutoExp [:tonum [:pick $resto 0 $pos2]]
                        :local minutosExpira ($horaExp * 60 + $minutoExp)
                        
                        :if ($minutosAtuais >= $minutosExpira) do={
                            :set deveRemover true
                            :put ("  Status: EXPIRADO (" . $minutosAtuais . " >= " . $minutosExpira . ")")
                        } else={
                            :local restante ($minutosExpira - $minutosAtuais)
                            :put ("  Status: ATIVO (expira em " . $restante . " minutos)")
                        }
                    }
                } else={
                    :put ("  Status: ATIVO (data futura)")
                }
            }
            
            # Remover se expirado
            :if ($deveRemover) do={
                :put ("  Acao: REMOVENDO...")
                
                :do {
                    /ip hotspot ip-binding remove $binding
                    :put ("  Resultado: REMOVIDO COM SUCESSO!")
                    :set removidos ($removidos + 1)
                    
                    # Notificar API
                    $notificarAPI $macAddr $nomeUser $authUrl $mikrotikId $authToken
                    
                    # Remover agendamento se existir
                    :do {
                        :local schedulers [/system scheduler find where name=("expire-" . $nomeUser)]
                        :if ([:len $schedulers] > 0) do={
                            /system scheduler remove $schedulers
                            :put ("  Agendamento removido: expire-" . $nomeUser)
                        }
                    } on-error={}
                    
                } on-error={
                    :put ("  Resultado: ERRO AO REMOVER!")
                }
            }
        } else={
            :put ("  ERRO: Formato de data invalido")
        }
    } else={
        :put ("  ERRO: Comentario sem EXPIRES/DURATION")
    }
}

:put "=== RESUMO ==="
:put ("Bypass expirados removidos: " . $removidos)
:if ($removidos > 0) do={
    :put ("API foi notificada sobre " . $removidos . " desconexoes")
} 