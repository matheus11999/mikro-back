# CONFIGURAÇÕES
:local apiUrl "https://api.lucro.top/api/recent-sales/78957cd3-7096-4acd-970b-0aa0a768c555"
:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"
:local apiToken "API_Access_2024_Strong_Token_P4uQ9wE6rT2yU1iO"

# FLAG DE DEBUG - MUDE PARA false PARA PRODUÇÃO
:local debug true

# FUNÇÃO DE LOG COM DEBUG
:local logMsg do={
    :local message $1
    :local isDebug $2
    :if ($isDebug and $debug) do={
        :log info "[DEBUG] $message"
        :put "[DEBUG] $message"
    }
    :if (!$isDebug) do={
        :log info "[PIX] $message"
        :put "[PIX] $message"
    }
}

# FUNÇÃO DE NOTIFICAÇÃO DA API
:local notificarAPI do={
    :local mac $1
    :local acao $2
    $logMsg "Notificando API: $acao para MAC $mac" $debug
    :do {
        :local payload "{\"token\":\"$authToken\",\"mac_address\":\"$mac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"$acao\"}"
        $logMsg "Payload: $payload" $debug
        /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload dst-path="notify.tmp"
        :delay 500ms
        :local resposta ""
        :do {
            :set resposta [/file get [find name="notify.tmp"] contents]
            $logMsg "Resposta API: $resposta" $debug
        } on-error={
            $logMsg "Sem resposta da API" $debug
        }
        /file remove [find name="notify.tmp"]
        $logMsg "✓ Notificacao enviada: $acao" false
    } on-error={
        $logMsg "✗ Falha na notificacao: $acao" false
    }
}

# FUNÇÃO DE LIMPEZA COMPLETA DO MAC
:local limparMacCompleto do={
    :local mac $1
    $logMsg "=== INICIANDO LIMPEZA COMPLETA DO MAC: $mac ===" $debug
    
    # 1. Remover sessões ativas
    $logMsg "Removendo sessoes ativas..." $debug
    :do {
        :local sessoes [/ip hotspot active find where mac-address=$mac]
        :if ([:len $sessoes] > 0) do={
            :foreach sessao in=$sessoes do={
                :local sessaoInfo [/ip hotspot active get $sessao]
                $logMsg "Removendo sessao ativa: $sessaoInfo" $debug
                /ip hotspot active remove $sessao
            }
            $logMsg "✓ Sessoes ativas removidas" false
        } else={
            $logMsg "Nenhuma sessao ativa encontrada" $debug
        }
    } on-error={
        $logMsg "Erro ao remover sessoes ativas" $debug
    }
    
    # 2. Remover cookies do hotspot
    $logMsg "Removendo cookies do hotspot..." $debug
    :do {
        :local cookies [/ip hotspot cookie find where mac-address=$mac]
        :if ([:len $cookies] > 0) do={
            :foreach cookie in=$cookies do={
                $logMsg "Removendo cookie: $cookie" $debug
                /ip hotspot cookie remove $cookie
            }
            $logMsg "✓ Cookies removidos" false
        } else={
            $logMsg "Nenhum cookie encontrado" $debug
        }
    } on-error={
        $logMsg "Erro ao remover cookies (comando pode nao existir)" $debug
    }
    
    # 3. Remover usuários hotspot
    $logMsg "Removendo usuarios hotspot..." $debug
    :do {
        :local usuarios [/ip hotspot user find where mac-address=$mac]
        :if ([:len $usuarios] > 0) do={
            :foreach usuario in=$usuarios do={
                :local userInfo [/ip hotspot user get $usuario]
                $logMsg "Removendo usuario: $userInfo" $debug
                /ip hotspot user remove $usuario
            }
            $logMsg "✓ Usuarios removidos" false
        } else={
            $logMsg "Nenhum usuario encontrado" $debug
        }
    } on-error={
        $logMsg "Erro ao remover usuarios" $debug
    }
    
    # 4. Remover IP bindings
    $logMsg "Removendo IP bindings..." $debug
    :do {
        :local bindings [/ip hotspot ip-binding find where mac-address=$mac]
        :if ([:len $bindings] > 0) do={
            :foreach binding in=$bindings do={
                :local bindingInfo [/ip hotspot ip-binding get $binding]
                $logMsg "Removendo binding: $bindingInfo" $debug
                /ip hotspot ip-binding remove $binding
            }
            $logMsg "✓ IP bindings removidos" false
        } else={
            $logMsg "Nenhum IP binding encontrado" $debug
        }
    } on-error={
        $logMsg "Erro ao remover IP bindings" $debug
    }
    
    # 5. Limpar cache de hosts se existir
    $logMsg "Limpando cache de hosts..." $debug
    :do {
        /ip hotspot host remove [find mac-address=$mac]
        $logMsg "✓ Cache de hosts limpo" false
    } on-error={
        $logMsg "Cache de hosts vazio ou comando nao disponivel" $debug
    }
    
    $logMsg "=== LIMPEZA COMPLETA FINALIZADA ===" $debug
}

# ==================== SCRIPT PRINCIPAL ====================

$logMsg "=== PIX SCRIPT COMPLETO INICIADO ===" false

# ETAPA 1: BUSCAR VENDAS DA API
$logMsg "ETAPA 1: Consultando API de vendas..." false
$logMsg "URL: $apiUrl" $debug

:do {
    $logMsg "Fazendo requisicao HTTP GET..." $debug
    /tool fetch url=$apiUrl http-method=get dst-path="vendas.tmp"
    :delay 3s
    $logMsg "Requisicao concluida, lendo arquivo..." $debug
} on-error={
    $logMsg "✗ ERRO: Falha ao conectar com API" false
    return
}

:local vendas ""
:do {
    :set vendas [/file get [find name="vendas.tmp"] contents]
    $logMsg "Dados brutos lidos: [$vendas]" $debug
    $logMsg "Tamanho dos dados: [:len $vendas] caracteres" $debug
    /file remove [find name="vendas.tmp"]
} on-error={
    $logMsg "✗ ERRO: Falha ao ler dados da API" false
    return
}

# ETAPA 2: VALIDAR DADOS RECEBIDOS
$logMsg "ETAPA 2: Validando dados recebidos..." false

:if ([:len $vendas] = 0) do={
    $logMsg "Nenhuma venda encontrada - script finalizado" false
    return
}

$logMsg "Dados recebidos: $vendas" false

# ETAPA 3: FAZER PARSE DOS DADOS
$logMsg "ETAPA 3: Fazendo parse dos dados..." false

:local separador [:find $vendas "-"]
$logMsg "Posicao do separador '-': $separador" $debug

:if ($separador < 0) do={
    $logMsg "✗ ERRO: Formato invalido, esperado MAC-MINUTOS, recebido: $vendas" false
    return
}

:local mac [:pick $vendas 0 $separador]
:local minutosStr [:pick $vendas ($separador + 1) [:len $vendas]]

$logMsg "MAC extraido: [$mac]" $debug
$logMsg "Minutos string: [$minutosStr]" $debug

# Remover quebras de linha se existirem
:local i 0
:local minutosLimpo ""
:while ($i < [:len $minutosStr]) do={
    :local char [:pick $minutosStr $i ($i+1)]
    :if ($char != "\n" and $char != "\r" and $char != " ") do={
        :set minutosLimpo ($minutosLimpo . $char)
    }
    :set i ($i + 1)
}

:local minutos [:tonum $minutosLimpo]
$logMsg "Minutos convertidos: $minutos" $debug

$logMsg "Processando: MAC=$mac, Duracao=$minutos minutos" false

# ETAPA 4: LIMPEZA PRÉVIA
$logMsg "ETAPA 4: Fazendo limpeza previa..." false
$limparMacCompleto $mac

# ETAPA 5: CRIAR NOVO IP BINDING
$logMsg "ETAPA 5: Criando novo IP binding..." false

:do {
    $logMsg "Executando comando: /ip hotspot ip-binding add..." $debug
    /ip hotspot ip-binding add mac-address=$mac type=bypassed comment="PIX-$mac-$minutos-[:tostr [/system clock get time]]"
    $logMsg "✓ IP Binding criado com sucesso para $mac" false
    
    # ETAPA 6: NOTIFICAR API SOBRE CONEXÃO
    $logMsg "ETAPA 6: Notificando API sobre conexao..." false
    $notificarAPI $mac "connect"
    
    # ETAPA 7: CALCULAR HORÁRIO DE EXPIRAÇÃO
    $logMsg "ETAPA 7: Calculando horario de expiracao..." false
    
    :local agora [/system clock get time]
    $logMsg "Horario atual: $agora" $debug
    
    :local hora [:tonum [:pick $agora 0 [:find $agora ":"]]]
    :local min [:tonum [:pick $agora 3 5]]
    :local seg [:tonum [:pick $agora 6 8]]
    
    $logMsg "Hora atual decomposta: $hora:$min:$seg" $debug
    
    :local totalMinutosAtual (($hora * 60) + $min)
    :local totalMinutosFim ($totalMinutosAtual + $minutos)
    
    $logMsg "Minutos desde meia-noite atual: $totalMinutosAtual" $debug
    $logMsg "Minutos since meia-noite final: $totalMinutosFim" $debug
    
    :local horaFim ($totalMinutosFim / 60)
    :local minutoFim ($totalMinutosFim % 60)
    
    :if ($horaFim >= 24) do={
        :set horaFim ($horaFim - 24)
        $logMsg "Horario passou da meia-noite, ajustado para: $horaFim" $debug
    }
    
    :local horaStr [:tostr $horaFim]
    :local minStr [:tostr $minutoFim]
    :local segStr [:tostr $seg]
    
    :if ([:len $horaStr] = 1) do={ :set horaStr ("0" . $horaStr) }
    :if ([:len $minStr] = 1) do={ :set minStr ("0" . $minStr) }
    :if ([:len $segStr] = 1) do={ :set segStr ("0" . $segStr) }
    
    :local tempoExpiracao ($horaStr . ":" . $minStr . ":" . $segStr)
    
    $logMsg "Horario de expiracao calculado: $tempoExpiracao" false
    
    # ETAPA 8: CRIAR SCHEDULER DE REMOÇÃO
    $logMsg "ETAPA 8: Criando scheduler de remocao..." false
    
    :local nomeScheduler "pix-rm-$mac"
    $logMsg "Nome do scheduler: $nomeScheduler" $debug
    
    # Remover scheduler anterior se existir
    :do {
        /system scheduler remove [find name=$nomeScheduler]
        $logMsg "Scheduler anterior removido" $debug
    } on-error={
        $logMsg "Nenhum scheduler anterior encontrado" $debug
    }
    
    # Criar comando complexo de remoção
    :local cmd1 ":log info \"[PIX-EXPIRE] Iniciando remocao do MAC $mac\""
    :local cmd2 "/ip hotspot active remove [find mac-address=$mac]"
    :local cmd3 "/ip hotspot user remove [find mac-address=$mac]"
    :local cmd4 "/ip hotspot ip-binding remove [find mac-address=$mac]"
    :local cmd5 ":do { /ip hotspot cookie remove [find mac-address=$mac] } on-error={}"
    :local cmd6 ":do { /ip hotspot host remove [find mac-address=$mac] } on-error={}"
    :local cmd7 "/tool fetch url=\"$authUrl\" http-method=post http-header-field=\"Content-Type: application/json\" http-data=\"{\\\"token\\\":\\\"$authToken\\\",\\\"mac_address\\\":\\\"$mac\\\",\\\"mikrotik_id\\\":\\\"$mikrotikId\\\",\\\"action\\\":\\\"disconnect\\\"}\""
    :local cmd8 "/system scheduler remove [find name=\"$nomeScheduler\"]"
    :local cmd9 ":log info \"[PIX-EXPIRE] Remocao completa do MAC $mac finalizada\""
    
    :local cmdCompleto "$cmd1; $cmd2; $cmd3; $cmd4; $cmd5; $cmd6; $cmd7; $cmd8; $cmd9"
    
    $logMsg "Comando de remocao preparado" $debug
    
    :do {
        /system scheduler add name=$nomeScheduler start-time=$tempoExpiracao interval=0 on-event=$cmdCompleto comment="AutoRemove-$mac-$minutos-min"
        $logMsg "✓ Scheduler criado: $nomeScheduler para $tempoExpiracao" false
    } on-error={
        $logMsg "✗ Falha ao criar scheduler" false
        return
    }
    
} on-error={
    $logMsg "✗ ERRO: Falha ao criar IP binding para $mac" false
    return
}

# ETAPA 9: FINALIZAÇÃO
$logMsg "ETAPA 9: Finalizacao..." false
$logMsg "✓ Processamento concluido com sucesso!" false
$logMsg "  - MAC: $mac" false
$logMsg "  - Duracao: $minutos minutos" false
$logMsg "  - Expira em: $tempoExpiracao" false
$logMsg "  - Scheduler: $nomeScheduler" false

$logMsg "=== PIX SCRIPT COMPLETO FINALIZADO ===" false 