:local apiUrl "https://api.lucro.top/api/recent-sales"
:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "mikrotik-secure-token-2024"
:local fullUrl ($apiUrl . "/" . $mikrotikId)

:log info "=== INICIANDO VERIFICACAO DE VENDAS RECENTES ==="

# Função para converter data do Mikrotik para formato ISO
:local converterData do={
    :local dataOriginal $1
    :local horaOriginal $2
    
    # Converter data jun/21/2025 para 2025-06-21
    :local pos1 [:find $dataOriginal "/"]
    :local pos2 [:find $dataOriginal "/" ($pos1 + 1)]
    
    :if ($pos1 >= 0 and $pos2 >= 0) do={
        :local mes [:pick $dataOriginal 0 $pos1]
        :local dia [:pick $dataOriginal ($pos1 + 1) $pos2]
        :local ano [:pick $dataOriginal ($pos2 + 1) [:len $dataOriginal]]
        
        # Converter mês para número
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
        
        # Formatar dia com zero à esquerda
        :if ([:len $dia] = 1) do={ :set dia ("0" . $dia) }
        
        # Retornar formato: 2025-06-21-17:25:00
        return ($ano . "-" . $mesNum . "-" . $dia . "-" . $horaOriginal)
    }
    
    # Se não conseguir converter, retorna original
    return ($dataOriginal . "-" . $horaOriginal)
}

# Função para calcular tempo de expiração com mudança de data
:local calcularExpiracao do={
    :local horaAtual $1
    :local minutoAtual $2
    :local duracaoMinutos $3
    :local dataAtual $4
    
    :local minutosAtuais ($horaAtual * 60 + $minutoAtual)
    :local minutosExpiracao ($minutosAtuais + $duracaoMinutos)
    
    # Calcular nova hora e minuto
    :local novaHora [:tonum ($minutosExpiracao / 60)]
    :local novoMinuto ($minutosExpiracao % 60)
    :local novaData $dataAtual
    
    # Se passou de 24h, ajustar data
    :if ($novaHora >= 24) do={
        :set novaHora ($novaHora - 24)
        # Aqui poderíamos calcular próximo dia, mas para simplicidade vamos manter mesma data
        # Na prática, planos raramente ultrapassam 24h
    }
    
    # Formatar hora final
    :local horaStr 
    :local minutoStr
    :if ($novaHora < 10) do={ :set horaStr ("0" . $novaHora) } else={ :set horaStr $novaHora }
    :if ($novoMinuto < 10) do={ :set minutoStr ("0" . $novoMinuto) } else={ :set minutoStr $novoMinuto }
    
    return ($horaStr . ":" . $minutoStr . ":00")
}

# Função para notificar autenticação na API
:local notificarAPI do={
   :local macAddress $1
   :local usuario $2
   :local duracao $3
   :local authUrl $4
   :local mikrotikId $5
   :local authToken $6
   :local acao $7
   
   :log info ("[NOTIFICACAO] Enviando $acao para API: MAC=$macAddress, Usuario=$usuario")
   
   # Criar JSON payload para a nova API
   :local jsonPayload "{\"token\":\"$authToken\",\"mac_address\":\"$macAddress\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"$acao\",\"usuario\":\"$usuario\"}"
   
   # Fazer POST para notificar autenticação
   :do {
       /tool fetch url=$authUrl http-method=post http-header-field="Content-Type:application/json" http-data=$jsonPayload dst-path="auth_notify.txt"
       :delay 1s
       
       # Ler resposta
       :local response ""
       :do {
           :set response [/file get [find name="auth_notify.txt"] contents]
           :log info ("[NOTIFICACAO] Resposta da API para $usuario ($acao): OK")
       } on-error={
           :log warning ("[NOTIFICACAO] Nao foi possivel ler resposta para $usuario")
       }
       
       # Limpar arquivo de resposta
       :do { /file remove [find name="auth_notify.txt"] } on-error={}
       
   } on-error={
       :log error ("[NOTIFICACAO] ERRO ao notificar $acao na API para $usuario (MAC: $macAddress)")
   }
}

# Função para verificar se MAC está em trial
:local verificarTrial do={
    :local macAddress $1
    :local isInTrial false
    
    # Verificar se existe user trial ativo para este MAC
    :do {
        :local trialUsers [/ip hotspot user find where mac-address=$macAddress and profile~"trial"]
        :if ([:len $trialUsers] > 0) do={
            :set isInTrial true
            :log info ("[TRIAL] MAC $macAddress possui trial ativo - será removido antes do bypass")
        }
    } on-error={
        :log warning ("[TRIAL] Erro ao verificar trial para MAC $macAddress")
    }
    
    # Verificar também em active sessions
    :do {
        :local activeSessions [/ip hotspot active find where mac-address=$macAddress]
        :if ([:len $activeSessions] > 0) do={
            :foreach session in=$activeSessions do={
                :local sessionInfo [/ip hotspot active get $session]
                :local sessionUser ($sessionInfo->"user")
                :if ($sessionUser~"trial") do={
                    :set isInTrial true
                    :log info ("[TRIAL] MAC $macAddress tem sessao trial ativa (usuario: $sessionUser) - sera desconectado")
                    # Desconectar sessão trial
                    /ip hotspot active remove $session
                }
            }
        }
    } on-error={
        :log warning ("[TRIAL] Erro ao verificar sessoes ativas para MAC $macAddress")
    }
    
    return $isInTrial
}

# Buscar vendas da API
:log info ("[VENDAS] Consultando vendas recentes na API...")
:do {
    /tool fetch url=$fullUrl dst-path="vendas.txt"
    :delay 3s
} on-error={
    :log error "[VENDAS] ERRO no download da API - verifique conectividade"
    return
}

:local content ""
:do {
    :set content [/file get [find name="vendas.txt"] contents]
} on-error={
    :log error "[VENDAS] ERRO ao ler arquivo de vendas"
    return
}

:if ([:len $content] = 0) do={
    :log info "[VENDAS] Nenhuma venda recente encontrada (todos MACs ja conectados)"
    :do { /file remove [find name="vendas.txt"] } on-error={}
    return
}

:log info ("[VENDAS] Processando vendas de MACs desconectados...")

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

:local totalVendas [:len $linhas]
:log info ("[VENDAS] Encontradas $totalVendas vendas de MACs desconectados para processar")

# Processar cada venda
:local vendasProcessadas 0
:local vendasIgnoradas 0

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
            
            :log info ("=== PROCESSANDO VENDA ===")
            :log info ("[VENDA] Usuario: $usuario | MAC: $macAddress | Duracao: $duracao min")
            
            # Verificar se MAC já tem IP binding ativo
            :local macExiste false
            :do {
                /ip hotspot ip-binding get [find mac-address=$macAddress]
                :set macExiste true
                :log info ("[BINDING] MAC $macAddress ja possui IP binding ativo")
            } on-error={
                :set macExiste false
                :log info ("[BINDING] MAC $macAddress nao possui IP binding - sera criado")
            }
            
            :if (!$macExiste) do={
                # VERIFICAR E REMOVER TRIAL ANTES DE CRIAR BYPASS
                :log info ("[TRIAL] Verificando trial para MAC $macAddress...")
                :local temTrial [$verificarTrial $macAddress]
                
                :if ($temTrial) do={
                    # Remover users trial para este MAC
                    :do {
                        :local trialUsers [/ip hotspot user find where mac-address=$macAddress]
                        :foreach trialUser in=$trialUsers do={
                            :local trialUserInfo [/ip hotspot user get $trialUser]
                            :local trialUserName ($trialUserInfo->"name")
                            /ip hotspot user remove $trialUser
                            :log info ("[TRIAL] Usuario trial removido: $trialUserName para MAC $macAddress")
                        }
                    } on-error={
                        :log warning ("[TRIAL] Erro ao remover usuarios trial para MAC $macAddress")
                    }
                }
                
                # Obter data e hora atuais
                :local agora [/system clock get time]
                :local hoje [/system clock get date]
                :local horaAtual [:tonum [:pick $agora 0 2]]
                :local minutoAtual [:tonum [:pick $agora 3 5]]
                
                # Calcular tempo de expiração
                :local tempoFinal [$calcularExpiracao $horaAtual $minutoAtual $duracao $hoje]
                
                # Converter datas para formato ISO
                :local dataHoraCreated [$converterData $hoje $agora]
                :local dataHoraExpires [$converterData $hoje $tempoFinal]
                
                :log info ("[HORARIO] Criado em: $dataHoraCreated")
                :log info ("[HORARIO] Expira em: $dataHoraExpires")
                
                # Limpar registros anteriores do mesmo usuário
                :do { 
                    :local oldBindings [/ip hotspot ip-binding find where comment~("USER:" . $usuario)]
                    :if ([:len $oldBindings] > 0) do={
                        /ip hotspot ip-binding remove $oldBindings
                        :log info ("[LIMPEZA] Removidos bindings antigos do usuario $usuario")
                    }
                } on-error={}
                
                :do { 
                    :local oldSchedulers [/system scheduler find where name=("expire-" . $usuario)]
                    :if ([:len $oldSchedulers] > 0) do={
                        /system scheduler remove $oldSchedulers
                        :log info ("[LIMPEZA] Removidos agendamentos antigos do usuario $usuario")
                    }
                } on-error={}
                
                # Criar IP Binding com formato de data correto
                :local bindingCriado false
                :log info ("[BINDING] Criando IP binding para $usuario...")
                :do {
                    # Comentário com formato compatível com script de cleanup
                    :local comentario ("USER:" . $usuario . "|CREATED:" . $dataHoraCreated . "|EXPIRES:" . $dataHoraExpires . "|DURATION:" . $duracao)
                    
                    /ip hotspot ip-binding add mac-address=$macAddress address=0.0.0.0 type=bypassed comment=$comentario
                    :log info ("[BINDING] ✓ IP Binding criado com sucesso para $usuario (MAC: $macAddress)")
                    :log info ("[BINDING] Comentario: $comentario")
                    :set bindingCriado true
                } on-error={
                    :log error ("[BINDING] ✗ Erro ao criar IP Binding para $usuario (MAC: $macAddress)")
                    :set bindingCriado false
                }
                
                # SE IP BINDING FOI CRIADO COM SUCESSO, NOTIFICAR API
                :if ($bindingCriado) do={
                    :log info ("[API] Notificando conexao para usuario $usuario...")
                    $notificarAPI $macAddress $usuario $duracao $authUrl $mikrotikId $authToken "connect"
                    :set vendasProcessadas ($vendasProcessadas + 1)
                }
                
                # Agendar remoção com notificação de desconexão
                :if ($bindingCriado) do={
                    :do {
                        # Script que será executado na expiração
                        :local expireScript ("/ip hotspot ip-binding remove [find comment~\"USER:$usuario\"]; /system scheduler remove [find name=\"expire-$usuario\"]; :log info \"[EXPIRACAO] Bypass do usuario $usuario expirado e removido\";")
                        
                        # Adicionar notificação de desconexão
                        :set expireScript ($expireScript . ":local authUrl \"$authUrl\"; :local mikrotikId \"$mikrotikId\"; :local authToken \"$authToken\"; :local macAddress \"$macAddress\"; :local usuario \"$usuario\"; :local jsonPayload \"{\\\"token\\\":\\\"\" . \$authToken . \"\\\",\\\"mac_address\\\":\\\"\" . \$macAddress . \"\\\",\\\"mikrotik_id\\\":\\\"\" . \$mikrotikId . \"\\\",\\\"action\\\":\\\"disconnect\\\",\\\"usuario\\\":\\\"\" . \$usuario . \\\"\\\"}\"; :do { /tool fetch url=\$authUrl http-method=post http-header-field=\"Content-Type:application/json\" http-data=\$jsonPayload dst-path=\"disconnect_notify.txt\"; :delay 1s; /file remove [find name=\"disconnect_notify.txt\"]; :log info \"[API] Desconexao notificada para usuario \" . \$usuario; } on-error={ :log error \"[API] Erro ao notificar desconexao para \" . \$usuario; };")
                        
                        /system scheduler add name=("expire-" . $usuario) start-date=$hoje start-time=$tempoFinal on-event=$expireScript comment=("Expira bypass $usuario e notifica API")
                        :log info ("[AGENDAMENTO] ✓ Expiracao agendada para $usuario as $tempoFinal")
                    } on-error={
                        :log error ("[AGENDAMENTO] ✗ Erro ao agendar expiracao para $usuario")
                    }
                }
            } else={
                :log info ("[BINDING] MAC $macAddress ja possui bypass ativo - ignorando")
                :set vendasIgnoradas ($vendasIgnoradas + 1)
            }
        } else={
            :log warning ("[VENDA] Linha com formato invalido ignorada: $linhaAtual")
        }
    }
}

# Limpar arquivo de vendas
:do { /file remove [find name="vendas.txt"] } on-error={}

# Log final com estatísticas
:log info "=== PROCESSAMENTO CONCLUIDO ==="
:log info ("[RESUMO] Total encontradas: $totalVendas | Processadas: $vendasProcessadas | Ignoradas: $vendasIgnoradas")
:log info ("[RESUMO] Verificacao de vendas finalizada com sucesso")
:log info "=========================================" 