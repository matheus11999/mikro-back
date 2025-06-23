# Script: Verificador de Pagamentos PIX - Com Token Individual
# Descrição: Verifica pagamentos aprovados nos últimos 5 minutos e cria bindings
# Execução: A cada 40 segundos via scheduler

:local apiUrl "https://api.lucro.top/api/recent-sales"
:local mikrotikId "MIKROTIK_ID_AQUI"
:local apiToken "API_TOKEN_AQUI"

:log info "=== PIX VERIFICADOR INICIADO ==="

:local macs ""
:local tentativas 5

:for tentativa from=1 to=$tentativas do={
    :log info "Tentativa $tentativa de $tentativas"
    
    # Preparar dados JSON para POST
    :local jsonData "{\"mikrotik_id\":\"$mikrotikId\",\"token\":\"$apiToken\"}"
    
    :do {
        # Fazer requisição POST com token
        /tool fetch url=$apiUrl \
            http-method=post \
            http-header-field="Content-Type:application/json" \
            http-data=$jsonData \
            dst-path="vendas.txt"
        
        :delay 2s
        
        # Verificar se arquivo foi criado
        :if ([/file find name="vendas.txt"] != "") do={
            :local vendas [/file get [find name="vendas.txt"] contents]
            /file remove [find name="vendas.txt"]
            
            :if ([:len $vendas] > 0) do={
                :log info "Vendas encontradas: $vendas"
                
                # Processar cada linha de venda
                :local pos [:find $vendas "-"]
                :if ($pos >= 0) do={
                    :local mac [:pick $vendas 0 $pos]
                    :local resto [:pick $vendas ($pos + 1) [:len $vendas]]
                    :local pos2 [:find $resto "-"]
                    :local senha [:pick $resto 0 $pos2]
                    :local resto2 [:pick $resto ($pos2 + 1) [:len $resto]]
                    :local pos3 [:find $resto2 "-"]
                    :local macAddr [:pick $resto2 0 $pos3]
                    :local minutos [:tonum [:pick $resto2 ($pos3 + 1) [:len $resto2]]]
                    
                    :log info "Processando: MAC=$macAddr, Minutos=$minutos"
                    
                    # Verificar se MAC já não foi processado
                    :if ([:find $macs $macAddr] < 0) do={
                        # Remover binding existente (se houver)
                        :do {
                            /ip hotspot ip-binding remove [find mac-address=$macAddr]
                            :log info "Binding anterior removido para $macAddr"
                        } on-error={
                            :log info "Nenhum binding anterior para $macAddr"
                        }
                        
                        # Calcular horário de expiração
                        :local agora [/system clock get time]
                        :local h [:tonum [:pick $agora 0 2]]
                        :local m [:tonum [:pick $agora 3 5]]
                        :local novoMin (($h * 60) + $m + $minutos)
                        :local novaH ($novoMin / 60)
                        :local novaM ($novoMin % 60)
                        
                        # Ajustar se passar de 24h
                        :if ($novaH >= 24) do={
                            :set novaH ($novaH - 24)
                        }
                        
                        # Formatar horas e minutos
                        :local hs [:tostr $novaH]
                        :local ms [:tostr $novaM]
                        :if ([:len $hs] = 1) do={ :set hs ("0" . $hs) }
                        :if ([:len $ms] = 1) do={ :set ms ("0" . $ms) }
                        
                        # Criar comentário com data de expiração
                        :local dataExpire ([/system clock get date] . "-" . $hs . $ms)
                        :local comentario ("PIX-EXPIRE-" . $dataExpire . "-" . $macAddr)
                        
                        # Criar novo binding
                        /ip hotspot ip-binding add \
                            mac-address=$macAddr \
                            type=bypassed \
                            comment=$comentario
                        
                        :log info "Binding criado: $macAddr expira em $dataExpire"
                        :set macs ($macs . $macAddr . ";")
                    }
                }
                
                # Sair do loop se processou vendas
                :set tentativa $tentativas
            } else={
                :log info "Nenhuma venda nova encontrada"
            }
        } else={
            :log error "Arquivo vendas.txt não foi criado"
        }
        
    } on-error={
        :log error "Erro na tentativa $tentativa: $!"
        :if ($tentativa < $tentativas) do={
            :delay 5s
        }
    }
}

# Executar notificador se processou MACs
:if ([:len $macs] > 0) do={
    :global pixMacsNotificar $macs
    :global pixAcaoNotificar "connect"
    :log info "Executando notificador para MACs: $macs"
    
    :do {
        /system script run notificador-pix
    } on-error={
        :log error "Erro ao executar notificador: $!"
    }
} else={
    :log info "Nenhum MAC novo processado"
}

:log info "=== PIX VERIFICADOR CONCLUIDO ===" 