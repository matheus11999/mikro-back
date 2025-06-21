:local apiUrl "https://api.lucro.top/api/recent-sales"
:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "mikrotik-secure-token-2024"
:local fullUrl ($apiUrl . "/" . $mikrotikId)

# Função para notificar autenticação na API
:local notificarAutenticacao do={
   :local macAddress $1
   :local usuario $2
   :local duracao $3
   :local authUrl $4
   :local mikrotikId $5
   :local authToken $6
   :local acao $7
   
   # Criar JSON payload para a nova API
   :local jsonPayload "{\"token\":\"$authToken\",\"mac_address\":\"$macAddress\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"$acao\",\"usuario\":\"$usuario\",\"ip_address\":\"\",\"duration\":$duracao}"
   
   # Fazer POST para notificar autenticação
   :do {
       /tool fetch url=$authUrl http-method=post http-header-field="Content-Type:application/json" http-data=$jsonPayload dst-path="auth_response.txt"
       :delay 2s
       
       # Ler resposta (opcional)
       :local response ""
       :do {
           :set response [/file get [find name="auth_response.txt"] contents]
           :log info ("[API] Notificacao enviada para $usuario ($acao): $response")
       } on-error={
           :log warning ("[API] Nao foi possivel ler resposta da notificacao")
       }
       
       # Limpar arquivo de resposta
       :do { /file remove [find name="auth_response.txt"] } on-error={}
       
   } on-error={
       :log error ("[API] ERRO ao notificar $acao para $usuario (MAC: $macAddress)")
   }
}

# Buscar vendas da API
:do {
    /tool fetch url=$fullUrl dst-path="vendas.txt"
    :delay 3s
} on-error={
    :log error "[API] ERRO no download"
    return
}

:local content ""
:do {
    :set content [/file get [find name="vendas.txt"] contents]
} on-error={
    :log error "[API] ERRO ao ler arquivo"
    return
}

:if ([:len $content] = 0) do={
    :do { /file remove [find name="vendas.txt"] } on-error={}
    return
}

# Processar linhas
:local linha ""
:local linhas [:toarray ""]

:local i 0
:while ($i < [:len $content]) do={
    :local char [:pick $content $i ($i+1)]
    :if ($char = "\n" or $char = "\r") do={
        :if ([:len $linha] > 0) do={
            :set linhas ($linhas, $linha)
            :set linha ""
        }
    } else={
        :set linha ($linha . $char)
    }
    :set i ($i + 1)
}

:if ([:len $linha] > 0) do={
    :set linhas ($linhas, $linha)
}

# Processar cada venda
:foreach linhaAtual in=$linhas do={
    :if ([:len $linhaAtual] > 0) do={
        :local campos [:toarray ""]
        :local campo ""
        :local j 0
        
        :while ($j < [:len $linhaAtual]) do={
            :local charCampo [:pick $linhaAtual $j ($j+1)]
            :if ($charCampo = "-") do={
                :set campos ($campos, $campo)
                :set campo ""
            } else={
                :set campo ($campo . $charCampo)
            }
            :set j ($j + 1)
        }
        :set campos ($campos, $campo)
        
        :if ([:len $campos] >= 3) do={
            :local usuario [:pick $campos 0]
            :local senha [:pick $campos 1]
            :local macAddress [:pick $campos 2]
            :local duracao 60
            
            :if ([:len $campos] >= 4) do={
                :set duracao [:tonum [:pick $campos 3]]
            }
            
            :local macExiste false
            :do {
                /ip hotspot ip-binding get [find mac-address=$macAddress]
                :set macExiste true
            } on-error={
                :set macExiste false
            }
            
            :if (!$macExiste) do={
                :local agora [/system clock get time]
                :local hoje [/system clock get date]
                :local horaAtual [:tonum [:pick $agora 0 2]]
                :local minutoAtual [:tonum [:pick $agora 3 5]]
                :local minutosExpiracao ($horaAtual * 60 + $minutoAtual + $duracao)
                :local horaFinal [:tonum ($minutosExpiracao / 60)]
                :local minutoFinal ($minutosExpiracao % 60)
                
                :if ($horaFinal >= 24) do={ :set horaFinal ($horaFinal - 24) }
                
                :local horaFinalStr
                :local minutoFinalStr
                :if ($horaFinal < 10) do={ :set horaFinalStr ("0" . $horaFinal) } else={ :set horaFinalStr $horaFinal }
                :if ($minutoFinal < 10) do={ :set minutoFinalStr ("0" . $minutoFinal) } else={ :set minutoFinalStr $minutoFinal }
                :local tempoFinal ($horaFinalStr . ":" . $minutoFinalStr . ":00")
                
                # Limpar registros anteriores
                :do { /ip hotspot ip-binding remove [find comment~$usuario] } on-error={}
                :do { /system scheduler remove [find name=("expire-" . $usuario)] } on-error={}
                
                # Criar IP Binding
                :local bindingCriado false
                :do {
                    /ip hotspot ip-binding add mac-address=$macAddress address=0.0.0.0 type=bypassed comment=("USER:" . $usuario . "|CREATED:" . $hoje . "-" . $agora . "|EXPIRES:" . $hoje . "-" . $tempoFinal . "|DURATION:" . $duracao)
                    :log info ("[API] IP Binding criado para $usuario (MAC: $macAddress)")
                    :set bindingCriado true
                } on-error={
                    :log error ("[API] Erro ao criar IP Binding para $usuario")
                    :set bindingCriado false
                }
                
                # Se IP Binding foi criado com sucesso, notificar autenticação na API
                :if ($bindingCriado) do={
                    :log info ("[API] Notificando conexao na API para $usuario")
                    $notificarAutenticacao $macAddress $usuario $duracao $authUrl $mikrotikId $authToken "connect"
                }
                
                # Agendar remoção com notificação de desconexão
                :do {
                    :local expireScript ("/ip hotspot ip-binding remove [find comment~\"USER:$usuario\"]; /system scheduler remove [find name=\"expire-$usuario\"]; :log info \"Bypass $usuario expirado e removido\";")
                    
                    # Adicionar notificação de desconexão ao script de expiração
                    :set expireScript ($expireScript . ":local authUrl \"$authUrl\"; :local mikrotikId \"$mikrotikId\"; :local authToken \"$authToken\"; :local macAddress \"$macAddress\"; :local usuario \"$usuario\"; :local jsonPayload \"{\\\"token\\\":\\\"\" . \$authToken . \"\\\",\\\"mac_address\\\":\\\"\" . \$macAddress . \"\\\",\\\"mikrotik_id\\\":\\\"\" . \$mikrotikId . \"\\\",\\\"action\\\":\\\"disconnect\\\",\\\"usuario\\\":\\\"\" . \$usuario . \\\"\\\"}\"; :do { /tool fetch url=\$authUrl http-method=post http-header-field=\"Content-Type:application/json\" http-data=\$jsonPayload dst-path=\"disconnect_response.txt\"; :delay 1s; /file remove [find name=\"disconnect_response.txt\"]; :log info \"[API] Desconexao notificada para \" . \$usuario; } on-error={ :log error \"[API] Erro ao notificar desconexao para \" . \$usuario; };")
                    
                    /system scheduler add name=("expire-" . $usuario) start-date=$hoje start-time=$tempoFinal on-event=$expireScript comment=("Remove bypass $usuario em $hoje $tempoFinal")
                    :log info ("[API] Remocao agendada para $usuario as $tempoFinal")
                } on-error={
                    :log error ("[API] Erro ao agendar remocao para $usuario")
                }
            } else={
                :log info ("[API] MAC $macAddress ja existe - ignorando")
            }
        }
    }
}

# Limpar arquivo de vendas
:do { /file remove [find name="vendas.txt"] } on-error={}

:log info "[API] Script finalizado - verificacao de vendas concluida" 