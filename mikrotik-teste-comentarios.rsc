:log info "=== TESTE DE COMENTARIOS E LIMPEZA ==="

:log info "Removendo bindings de teste anteriores..."
:do { /ip hotspot ip-binding remove [find mac-address="AA:BB:CC:DD:EE:01"] } on-error={}
:do { /ip hotspot ip-binding remove [find mac-address="AA:BB:CC:DD:EE:02"] } on-error={}
:do { /ip hotspot ip-binding remove [find mac-address="AA:BB:CC:DD:EE:03"] } on-error={}

:log info "Criando binding que deveria estar EXPIRADO (ontem)..."
/ip hotspot ip-binding add \
    mac-address="AA:BB:CC:DD:EE:01" \
    type=bypassed \
    comment="PIX-EXPIRE-20241220-1200-AA:BB:CC:DD:EE:01"

:log info "Criando binding que deveria estar ATIVO (daqui 1 hora)..."
:local agora [/system clock get time]
:local h [:tonum [:pick $agora 0 [:find $agora ":"]]]
:local m [:tonum [:pick $agora 3 5]]
:local novaH ($h + 1)
:if ($novaH >= 24) do={ :set novaH ($novaH - 24) }
:local hs [:tostr $novaH]
:local ms [:tostr $m]
:if ([:len $hs] = 1) do={ :set hs ("0" . $hs) }
:if ([:len $ms] = 1) do={ :set ms ("0" . $ms) }
:local hoje [/system clock get date]
:local ano [:pick $hoje 7 11]
:local mes [:pick $hoje 0 3]
:local dia [:pick $hoje 4 6]
:local mesNum "01"
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
:local diaStr [:tostr $dia]
:if ([:len $diaStr] = 1) do={ :set diaStr ("0" . $diaStr) }
:local comentarioAtivo ("PIX-EXPIRE-" . $ano . $mesNum . $diaStr . "-" . $hs . $ms . "-AA:BB:CC:DD:EE:02")

/ip hotspot ip-binding add \
    mac-address="AA:BB:CC:DD:EE:02" \
    type=bypassed \
    comment=$comentarioAtivo

:log info "Criando binding que deveria estar EXPIRADO (há 1 minuto)..."
:local minAnterior ($m - 1)
:if ($minAnterior < 0) do={
    :set minAnterior 59
    :set h ($h - 1)
    :if ($h < 0) do={ :set h 23 }
}
:local hsAnt [:tostr $h]
:local msAnt [:tostr $minAnterior]
:if ([:len $hsAnt] = 1) do={ :set hsAnt ("0" . $hsAnt) }
:if ([:len $msAnt] = 1) do={ :set msAnt ("0" . $msAnt) }
:local comentarioExpirado ("PIX-EXPIRE-" . $ano . $mesNum . $diaStr . "-" . $hsAnt . $msAnt . "-AA:BB:CC:DD:EE:03")

/ip hotspot ip-binding add \
    mac-address="AA:BB:CC:DD:EE:03" \
    type=bypassed \
    comment=$comentarioExpirado

:log info "Bindings de teste criados:"
:log info "1. AA:BB:CC:DD:EE:01 - EXPIRADO (ontem)"
:log info "2. AA:BB:CC:DD:EE:02 - ATIVO (daqui 1h): $comentarioAtivo"
:log info "3. AA:BB:CC:DD:EE:03 - EXPIRADO (1min atrás): $comentarioExpirado"

:log info ""
:log info "Executando script de limpeza..."
/system script run mikrotik-limpeza-completa

:delay 5s

:log info ""
:log info "Verificando resultados:"
:local count1 [:len [/ip hotspot ip-binding find mac-address="AA:BB:CC:DD:EE:01"]]
:local count2 [:len [/ip hotspot ip-binding find mac-address="AA:BB:CC:DD:EE:02"]]
:local count3 [:len [/ip hotspot ip-binding find mac-address="AA:BB:CC:DD:EE:03"]]

:if ($count1 = 0) do={
    :log info "✓ AA:BB:CC:DD:EE:01 foi removido (correto - estava expirado)"
} else={
    :log error "✗ AA:BB:CC:DD:EE:01 NAO foi removido (erro - deveria ter sido removido)"
}

:if ($count2 = 1) do={
    :log info "✓ AA:BB:CC:DD:EE:02 foi mantido (correto - ainda ativo)"
} else={
    :log error "✗ AA:BB:CC:DD:EE:02 foi removido (erro - deveria ter sido mantido)"
}

:if ($count3 = 0) do={
    :log info "✓ AA:BB:CC:DD:EE:03 foi removido (correto - estava expirado)"
} else={
    :log error "✗ AA:BB:CC:DD:EE:03 NAO foi removido (erro - deveria ter sido removido)"
}

:log info ""
:log info "=== TESTE CONCLUIDO ===" 