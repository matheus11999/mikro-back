:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"

:log info "=== LIMPEZA AUTOMATICA INICIADA ==="

:local notificarDisconnect do={
    :local mac $1
    :local payload "{\"token\":\"$authToken\",\"mac_address\":\"$mac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"disconnect\"}"
    :do {
        /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload
        :delay 1s
        :log info "Disconnect notificado para $mac"
    } on-error={
        :log warning "Falha ao notificar disconnect para $mac"
    }
}

:local agora [/system clock get time]
:local hoje [/system clock get date]
:local horaAtual [:tonum [:pick $agora 0 [:find $agora ":"]]]
:local minAtual [:tonum [:pick $agora 3 5]]
:local minutosAtuais (($horaAtual * 60) + $minAtual)

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

:local dataAtual ($ano . $mesNum . $diaStr)
:local horaAtualStr [:tostr $horaAtual]
:local minAtualStr [:tostr $minAtual]
:if ([:len $horaAtualStr] = 1) do={ :set horaAtualStr ("0" . $horaAtualStr) }
:if ([:len $minAtualStr] = 1) do={ :set minAtualStr ("0" . $minAtualStr) }
:local horaMinutoAtual ($horaAtualStr . $minAtualStr)

:log info "Data/Hora atual: $dataAtual-$horaMinutoAtual ($hoje $agora)"

:local removidos 0
:local total 0
:local ativos 0

:foreach binding in=[/ip hotspot ip-binding find where comment~"PIX-EXPIRE-"] do={
    :set total ($total + 1)
    :local bindingInfo [/ip hotspot ip-binding get $binding]
    :local comentario ($bindingInfo->"comment")
    :local macAddress ($bindingInfo->"mac-address")
    
    :log info "Verificando binding: $comentario"
    
    :local posExpire [:find $comentario "PIX-EXPIRE-"]
    :if ($posExpire >= 0) do={
        :local resto [:pick $comentario ($posExpire + 11) [:len $comentario]]
        :local posMac [:find $resto "-" 9]
        
        :if ($posMac >= 0) do={
            :local dataHoraExpire [:pick $resto 0 $posMac]
            :local macFromComment [:pick $resto ($posMac + 1) [:len $resto]]
            
            :local posTraco [:find $dataHoraExpire "-"]
            :if ($posTraco >= 0) do={
                :local dataExpire [:pick $dataHoraExpire 0 $posTraco]
                :local horaExpire [:pick $dataHoraExpire ($posTraco + 1) [:len $dataHoraExpire]]
                
                :log info "Data expiracao: $dataExpire, Hora: $horaExpire, MAC: $macFromComment"
                
                :local expirado false
                
                :if ($dataExpire < $dataAtual) do={
                    :set expirado true
                    :log info "Data expirada: $dataExpire < $dataAtual"
                } else={
                    :if ($dataExpire = $dataAtual) do={
                        :if ($horaExpire <= $horaMinutoAtual) do={
                            :set expirado true
                            :log info "Hora expirada: $horaExpire <= $horaMinutoAtual"
                        } else={
                            :log info "Ainda ativo: $horaExpire > $horaMinutoAtual"
                        }
                    } else={
                        :log info "Data futura: $dataExpire > $dataAtual"
                    }
                }
                
                :if ($expirado) do={
                    :log info "REMOVENDO binding expirado: $macAddress"
                    :do {
                        /ip hotspot ip-binding remove $binding
                        :log info "IP Binding removido para $macAddress"
                        $notificarDisconnect $macAddress
                        :set removidos ($removidos + 1)
                    } on-error={
                        :log error "Erro ao remover binding: $macAddress"
                    }
                } else={
                    :set ativos ($ativos + 1)
                    :log info "Binding ativo mantido: $macAddress"
                }
            } else={
                :log warning "Formato de data/hora invalido: $dataHoraExpire"
            }
        } else={
            :log warning "MAC nao encontrado no comentario: $resto"
        }
    } else={
        :log warning "Comentario sem PIX-EXPIRE-: $comentario"
    }
}

:log info "=== LIMPEZA CONCLUIDA ==="
:log info "Total verificados: $total"
:log info "Removidos (expirados): $removidos"
:log info "Ativos (mantidos): $ativos"
:log info "Outros: $(($total - $removidos - $ativos))" 