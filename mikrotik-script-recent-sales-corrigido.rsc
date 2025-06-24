# Script MikroTik para processar vendas recentes (formato: mac-minutos)
# Corrigido para funcionar com API das últimas 4 horas

:local apiUrl "https://api.lucro.top/api/recent-sales"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local apiToken "mtk_241ca9a5_cb1f8255"

:log info "PIX iniciado - buscando vendas das últimas 4 horas"

:local macs ""

:for tentativa from=1 to=3 do={
    :log info "Tentativa $tentativa de comunicação com API"
    
    # Dados JSON para autenticação
    :local jsonData "{\"mikrotik_id\":\"$mikrotikId\",\"token\":\"$apiToken\"}"
    
    # Fazer requisição POST com autenticação
    :do {
        /tool fetch url=$apiUrl http-method=post http-header-field="Content-Type:application/json" http-data=$jsonData dst-path="vendas.txt"
        :delay 2s
        
        # Ler resposta da API
        :local vendas [/file get [find name="vendas.txt"] contents]
        /file remove [find name="vendas.txt"]
        
        :if ([:len $vendas] > 0) do={
            :log info "Dados recebidos da API: $vendas"
            
            # Verificar se a resposta é "N/A" (nenhum MAC disponível)
            :if ($vendas = "N/A") do={
                :log info "API retornou N/A - nenhum MAC para processar"
                :set tentativa 10
            } else={
                # Processar cada linha (formato: mac-minutos)
                :local pos 0
                :local linhaAtual ""
                
                # Adicionar quebra de linha no final se não houver
                :if ([:find $vendas "\n"] < 0) do={
                    :set vendas ($vendas . "\n")
                }
                
                # Processar cada linha
                :while ([:find $vendas "\n" $pos] >= 0) do={
                    :local proximaLinha [:find $vendas "\n" $pos]
                    :set linhaAtual [:pick $vendas $pos $proximaLinha]
                    :set pos ($proximaLinha + 1)
                    
                    # Pular linhas vazias
                    :if ([:len $linhaAtual] > 0) do={
                        :log info "Processando linha: $linhaAtual"
                        
                        # Encontrar posição do hífen (separador mac-minutos)
                        :local posHifen [:find $linhaAtual "-"]
                        
                        :if ($posHifen >= 0) do={
                            :local mac [:pick $linhaAtual 0 $posHifen]
                            :local minutosStr [:pick $linhaAtual ($posHifen + 1) [:len $linhaAtual]]
                            :local minutos [:tonum $minutosStr]
                            
                            :log info "MAC: $mac, Minutos: $minutos"
                            
                            # Verificar se este MAC já foi processado
                            :if ([:find $macs $mac] < 0) do={
                                # Remover binding existente (se houver)
                                :do {
                                    /ip hotspot ip-binding remove [find mac-address=$mac]
                                    :log info "Binding anterior removido para: $mac"
                                } on-error={
                                    :log info "Nenhum binding anterior para: $mac"
                                }
                                
                                # Calcular horário de expiração
                                :local agora [/system clock get time]
                                :local h [:tonum [:pick $agora 0 2]]
                                :local m [:tonum [:pick $agora 3 5]]
                                :local s [:tonum [:pick $agora 6 8]]
                                
                                # Converter para minutos totais
                                :local minutosAtuais (($h * 60) + $m)
                                :local novoMinutosTotais ($minutosAtuais + $minutos)
                                
                                # Calcular nova hora e minutos
                                :local novaH ($novoMinutosTotais / 60)
                                :local novaM ($novoMinutosTotais % 60)
                                
                                # Tratar mudança de dia
                                :if ($novaH >= 24) do={
                                    :set novaH ($novaH - 24)
                                }
                                
                                # Formatar com zeros à esquerda
                                :local hs [:tostr $novaH]
                                :local ms [:tostr $novaM]
                                :if ([:len $hs] = 1) do={ :set hs ("0" . $hs) }
                                :if ([:len $ms] = 1) do={ :set ms ("0" . $ms) }
                                
                                # Criar comentário com data de expiração
                                :local dataExpire ([/system clock get date] . "-" . $hs . $ms)
                                :local comentario ("PIX-EXPIRE-" . $dataExpire . "-" . $mac)
                                
                                # Criar novo binding
                                /ip hotspot ip-binding add mac-address=$mac type=bypassed comment=$comentario
                                :log info "Binding criado: $mac até $hs:$ms ($minutos min)"
                                
                                # Adicionar à lista de MACs processados
                                :set macs ($macs . $mac . ";")
                            } else={
                                :log info "MAC $mac já foi processado, ignorando"
                            }
                        } else={
                            :log warning "Formato inválido na linha: $linhaAtual"
                        }
                    }
                }
                
                # Parar tentativas se obteve sucesso
                :set tentativa 10
            }
            
        } else={
            :log info "Nenhum dado recebido da API na tentativa $tentativa"
        }
        
    } on-error={
        :log error "Erro na comunicação com API na tentativa $tentativa"
        :delay 5s
    }
}

# Executar notificador se houver MACs processados
:if ([:len $macs] > 0) do={
    :global pixMacsNotificar $macs
    :global pixAcaoNotificar "connect"
    :log info "Executando notificador para MACs: $macs"
    
    :do {
        /system script run notificador-pix
    } on-error={
        :log error "Erro ao executar script notificador-pix"
    }
} else={
    :log info "Nenhum MAC foi processado"
}

:log info "PIX concluído - Total de MACs processados: " . [:len [/str split $macs ";"]] 