:log info "=== LIMPEZA AUTOMATICA INICIADA ==="
:local agora [/system clock get time]
:local hoje [/system clock get date]
:local h [:tonum [:pick $agora 0 [:find $agora ":"]]]
:local m [:tonum [:pick $agora 3 5]]
:local minAtual (($h * 60) + $m)
:local pos1 [:find $hoje "-"]
:local anoAtual [:tonum [:pick $hoje 0 $pos1]]
:local resto1 [:pick $hoje ($pos1 + 1) [:len $hoje]]
:local pos2 [:find $resto1 "-"]
:local mesAtual [:tonum [:pick $resto1 0 $pos2]]
:local diaAtual [:tonum [:pick $resto1 ($pos2 + 1) [:len $resto1]]]
:log info "HOJE: $anoAtual-$mesAtual-$diaAtual $h:$m"
:local macsExpirados ""
:local removidos 0
:local total 0
:foreach binding in=[/ip hotspot ip-binding find where comment~"PIX-EXPIRE-"] do={
    :set total ($total + 1)
    :local comentario [/ip hotspot ip-binding get $binding comment]
    :local macAddress [/ip hotspot ip-binding get $binding mac-address]
    :local pos [:find $comentario "PIX-EXPIRE-"]
    :local dados [:pick $comentario ($pos + 11) [:len $comentario]]
    :local p1 [:find $dados "-"]
    :local ano [:tonum [:pick $dados 0 $p1]]
    :local resto1 [:pick $dados ($p1 + 1) [:len $dados]]
    :local p2 [:find $resto1 "-"]
    :local mes [:tonum [:pick $resto1 0 $p2]]
    :local resto2 [:pick $resto1 ($p2 + 1) [:len $resto1]]
    :local p3 [:find $resto2 "-"]
    :local dia [:tonum [:pick $resto2 0 $p3]]
    :local resto3 [:pick $resto2 ($p3 + 1) [:len $resto2]]
    :local p4 [:find $resto3 "-"]
    :local horaStr [:pick $resto3 0 $p4]
    :local horas [:tonum [:pick $horaStr 0 2]]
    :local mins [:tonum [:pick $horaStr 2 4]]
    :local minExpire (($horas * 60) + $mins)
    :log info "EXPIRE: $ano-$mes-$dia $horas:$mins"
    :local expirou false
    :local dataAtualNum (($anoAtual * 10000) + ($mesAtual * 100) + $diaAtual)
    :local dataExpireNum (($ano * 10000) + ($mes * 100) + $dia)
    :log info "DataNum: atual=$dataAtualNum vs expire=$dataExpireNum"
    :if ($dataExpireNum < $dataAtualNum) do={
        :set expirou true
        :log info "EXPIROU: Data passada ($dataExpireNum < $dataAtualNum)"
    }
    :if ($dataExpireNum = $dataAtualNum and $minExpire <= $minAtual) do={
        :set expirou true
        :log info "EXPIROU: Mesmo dia, hora passada ($minExpire <= $minAtual)"
    }
    :if ($expirou) do={
        :log info "REMOVENDO: $macAddress"
        /ip hotspot ip-binding remove $binding
        :set macsExpirados ($macsExpirados . $macAddress . ";")
        :set removidos ($removidos + 1)
    } else={
        :log info "MANTENDO: $macAddress"
    }
}
:if ([:len $macsExpirados] > 0) do={
    :global pixMacsDesconectar $macsExpirados
    /system script run notificador-desconectado
}
:log info "=== TOTAL:$total REMOVIDOS:$removidos ===" 