# Script: Limpeza Automática de Bindings Expirados - Com Token Individual
# Descrição: Remove bindings PIX que expiraram e notifica desconexões
# Execução: A cada 2 minutos via scheduler

:local mikrotikId "MIKROTIK_ID_AQUI"
:local apiToken "API_TOKEN_AQUI"

:log info "=== LIMPEZA AUTOMATICA INICIADA ==="

# Obter data e hora atual
:local agora [/system clock get time]
:local hoje [/system clock get date]
:local h [:tonum [:pick $agora 0 [:find $agora ":"]]]
:local m [:tonum [:pick $agora 3 5]]
:local minAtual (($h * 60) + $m)

# Extrair ano, mês e dia atual
:local pos1 [:find $hoje "-"]
:local anoAtual [:tonum [:pick $hoje 0 $pos1]]
:local resto1 [:pick $hoje ($pos1 + 1) [:len $hoje]]
:local pos2 [:find $resto1 "-"]
:local mesAtual [:tonum [:pick $resto1 0 $pos2]]
:local diaAtual [:tonum [:pick $resto1 ($pos2 + 1) [:len $resto1]]]

:log info "Data/Hora atual: $anoAtual-$mesAtual-$diaAtual $h:$m (minutos: $minAtual)"

:local macsExpirados ""
:local removidos 0
:local total 0

# Processar todos os bindings PIX
:foreach binding in=[/ip hotspot ip-binding find where comment~"PIX-EXPIRE-"] do={
    :set total ($total + 1)
    
    :local comentario [/ip hotspot ip-binding get $binding comment]
    :local macAddress [/ip hotspot ip-binding get $binding mac-address]
    
    # Extrair data de expiração do comentário: PIX-EXPIRE-YYYY-MM-DD-HHMM-MAC
    :local pos [:find $comentario "PIX-EXPIRE-"]
    :local dados [:pick $comentario ($pos + 11) [:len $comentario]]
    
    # Extrair ano
    :local p1 [:find $dados "-"]
    :local ano [:tonum [:pick $dados 0 $p1]]
    :local resto1 [:pick $dados ($p1 + 1) [:len $dados]]
    
    # Extrair mês
    :local p2 [:find $resto1 "-"]
    :local mes [:tonum [:pick $resto1 0 $p2]]
    :local resto2 [:pick $resto1 ($p2 + 1) [:len $resto1]]
    
    # Extrair dia
    :local p3 [:find $resto2 "-"]
    :local dia [:tonum [:pick $resto2 0 $p3]]
    :local resto3 [:pick $resto2 ($p3 + 1) [:len $resto2]]
    
    # Extrair hora (HHMM)
    :local p4 [:find $resto3 "-"]
    :local horaStr [:pick $resto3 0 $p4]
    :local horas [:tonum [:pick $horaStr 0 2]]
    :local mins [:tonum [:pick $horaStr 2 4]]
    :local minExpire (($horas * 60) + $mins)
    
    :log info "Analisando $macAddress: expire=$ano-$mes-$dia $horas:$mins (min: $minExpire)"
    
    # Verificar se expirou
    :local expirou false
    
    # Comparar datas (formato numérico para facilitar)
    :local dataAtualNum (($anoAtual * 10000) + ($mesAtual * 100) + $diaAtual)
    :local dataExpireNum (($ano * 10000) + ($mes * 100) + $dia)
    
    :if ($dataExpireNum < $dataAtualNum) do={
        :set expirou true
        :log info "EXPIROU: Data passada ($dataExpireNum < $dataAtualNum)"
    }
    
    :if ($dataExpireNum = $dataAtualNum and $minExpire <= $minAtual) do={
        :set expirou true
        :log info "EXPIROU: Mesmo dia, horário passado ($minExpire <= $minAtual)"
    }
    
    # Remover se expirado
    :if ($expirou) do={
        :log info "REMOVENDO binding: $macAddress"
        
        :do {
            /ip hotspot ip-binding remove $binding
            :set macsExpirados ($macsExpirados . $macAddress . ";")
            :set removidos ($removidos + 1)
            :log info "Binding removido com sucesso: $macAddress"
        } on-error={
            :log error "Erro ao remover binding: $macAddress - $!"
        }
    } else={
        :log info "MANTENDO: $macAddress (ainda válido)"
    }
}

# Notificar desconexões se houver MACs expirados
:if ([:len $macsExpirados] > 0) do={
    :log info "Notificando desconexão de MACs: $macsExpirados"
    
    :global pixMacsDesconectar $macsExpirados
    
    :do {
        /system script run notificador-desconectado
    } on-error={
        :log error "Erro ao executar notificador de desconexão: $!"
    }
} else={
    :log info "Nenhum MAC expirado para notificar"
}

:log info "=== LIMPEZA CONCLUIDA: Total=$total Removidos=$removidos ===" 