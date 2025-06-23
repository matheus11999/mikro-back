:local apiBaseUrl "https://api.lucro.top"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"
:local apiToken "API_Access_2024_Strong_Token_P4uQ9wE6rT2yU1iO"

:log info "=== PIX SCRIPT DEBUG INICIADO ==="

:local notificar do={
    :local mac $1
    :local acao $2
    :log info "DEBUG: Tentando notificar $acao para $mac"
    :local payload "{\"token\":\"$authToken\",\"mac_address\":\"$mac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"$acao\"}"
    :do {
        /tool fetch url="$apiBaseUrl/api/mikrotik/auth-notification" http-method=post http-header-field="Authorization: Bearer $apiToken,Content-Type: application/json" http-data=$payload dst-path="notify-debug.txt"
        :delay 1s
        :local resposta [/file get [find name="notify-debug.txt"] contents]
        :log info "DEBUG: Resposta notificacao: $resposta"
        /file remove [find name="notify-debug.txt"]
    } on-error={
        :log error "DEBUG: Falha ao notificar $acao para $mac"
    }
}

:log info "DEBUG: Consultando API de vendas..."
:local apiUrl "$apiBaseUrl/api/recent-sales/$mikrotikId"

:do {
    /tool fetch url=$apiUrl http-method=get http-header-field="Authorization: Bearer $apiToken" dst-path="vendas-debug.txt"
    :delay 3s
} on-error={
    :log error "DEBUG: ERRO ao conectar API"
    return
}

:local vendas ""
:do {
    :set vendas [/file get [find name="vendas-debug.txt"] contents]
    /file remove [find name="vendas-debug.txt"]
} on-error={
    :log error "DEBUG: ERRO ao ler arquivo"
    return
}

:log info "DEBUG: Dados brutos recebidos:"
:log info "DEBUG: Tamanho: [:len $vendas] caracteres"
:log info "DEBUG: Conteudo: [$vendas]"

:if ([:len $vendas] = 0) do={
    :log info "DEBUG: Dados vazios - saindo"
    return
}

:log info "DEBUG: Iniciando parse de linhas..."

:local linhas [:toarray ""]
:local linha ""
:local i 0

:while ($i < [:len $vendas]) do={
    :local char [:pick $vendas $i ($i+1)]
    :if ($char = "\n" or $char = "\r") do={
        :if ([:len $linha] > 0) do={
            :set linhas ($linhas, $linha)
            :log info "DEBUG: Linha encontrada: [$linha]"
            :set linha ""
        }
    } else={
        :set linha ($linha . $char)
    }
    :set i ($i + 1)
}

:if ([:len $linha] > 0) do={
    :set linhas ($linhas, $linha)
    :log info "DEBUG: Ultima linha: [$linha]"
}

:log info "DEBUG: Total de linhas: [:len $linhas]"

:foreach linhaAtual in=$linhas do={
    :log info "DEBUG: Processando linha: [$linhaAtual]"
    
    :if ([:len $linhaAtual] > 0) do={
        :local separador [:find $linhaAtual "-"]
        :log info "DEBUG: Posicao do separador '-': $separador"
        
        :if ($separador >= 0) do={
            :local mac [:pick $linhaAtual 0 $separador]
            :local minutosStr [:pick $linhaAtual ($separador + 1) [:len $linhaAtual]]
            :log info "DEBUG: MAC extraido: [$mac]"
            :log info "DEBUG: Minutos string: [$minutosStr]"
            
            :local minutos [:tonum $minutosStr]
            :log info "DEBUG: Minutos convertidos: $minutos"
            
            :log info "DEBUG: Removendo bindings anteriores..."
            :do { 
                /ip hotspot ip-binding remove [find mac-address=$mac] 
                :log info "DEBUG: Binding anterior removido"
            } on-error={
                :log info "DEBUG: Nenhum binding anterior encontrado"
            }
            
            :log info "DEBUG: Criando novo binding..."
            :do {
                /ip hotspot ip-binding add mac-address=$mac type=bypassed comment="PIX-DEBUG-$mac-$minutos"
                :log info "DEBUG: ✓ Binding criado para $mac"
                
                :log info "DEBUG: Notificando connect..."
                $notificar $mac "connect"
                
                :log info "DEBUG: Calculando horario de expiracao..."
                :local agora [/system clock get time]
                :local horaAtual [:tonum [:pick $agora 0 [:find $agora ":"]]]
                :local minAtual [:tonum [:pick $agora 3 5]]
                :local segAtual [:tonum [:pick $agora 6 8]]
                
                :log info "DEBUG: Hora atual: $horaAtual:$minAtual:$segAtual"
                
                :local totalMin (($horaAtual * 60) + $minAtual + $minutos)
                :local horaFim ($totalMin / 60)
                :local minFim ($totalMin % 60)
                
                :if ($horaFim >= 24) do={ :set horaFim ($horaFim - 24) }
                
                :local horaStr [:tostr $horaFim]
                :local minStr [:tostr $minFim]
                :local segStr [:tostr $segAtual]
                
                :if ([:len $horaStr] = 1) do={ :set horaStr ("0" . $horaStr) }
                :if ([:len $minStr] = 1) do={ :set minStr ("0" . $minStr) }
                :if ([:len $segStr] = 1) do={ :set segStr ("0" . $segStr) }
                
                :local tempoFim ($horaStr . ":" . $minStr . ":" . $segStr)
                :log info "DEBUG: Tempo de expiracao calculado: $tempoFim"
                
                :local nomeScheduler "debug-rm-$mac"
                
                :do { 
                    /system scheduler remove [find name=$nomeScheduler] 
                    :log info "DEBUG: Scheduler anterior removido"
                } on-error={
                    :log info "DEBUG: Nenhum scheduler anterior"
                }
                
                :log info "DEBUG: Criando scheduler..."
                :do {
                    /system scheduler add name=$nomeScheduler start-time=$tempoFim interval=0 on-event="/ip hotspot ip-binding remove [find mac-address=$mac]" comment="DEBUG-REMOVE-$mac"
                    :log info "DEBUG: ✓ Scheduler criado: $nomeScheduler para $tempoFim"
                } on-error={
                    :log error "DEBUG: ✗ Falha ao criar scheduler"
                }
                
            } on-error={
                :log error "DEBUG: ✗ Falha ao criar binding para $mac"
            }
        } else={
            :log error "DEBUG: Separador '-' nao encontrado na linha: [$linhaAtual]"
        }
    } else={
        :log info "DEBUG: Linha vazia ignorada"
    }
}

:log info "=== PIX SCRIPT DEBUG CONCLUIDO ===" 