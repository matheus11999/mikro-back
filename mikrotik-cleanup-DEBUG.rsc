# Script DEBUG para identificar problema na remoção
:local agora [/system clock get time]
:local hoje [/system clock get date]
:local horaAtual [:tonum [:pick $agora 0 2]]
:local minutoAtual [:tonum [:pick $agora 3 5]]
:local minutosAtuais ($horaAtual * 60 + $minutoAtual)

:log info "=== DEBUG - INFORMACOES DO SISTEMA ==="
:log info ("[DEBUG] Data do sistema: $hoje")
:log info ("[DEBUG] Hora do sistema: $agora")
:log info ("[DEBUG] Minutos atuais: $minutosAtuais")

# Vamos analisar especificamente o binding do aaaaaaa7
:foreach binding in=[/ip hotspot ip-binding find where comment~"USER:aaaaaaa7"] do={
    :local comentario [/ip hotspot ip-binding get $binding comment]
    :local macAddr [/ip hotspot ip-binding get $binding mac-address]
    
    :log info "=== DEBUG - BINDING ENCONTRADO ==="
    :log info ("[DEBUG] Comentario completo: $comentario")
    :log info ("[DEBUG] MAC Address: $macAddr")
    
    # Extrair tempo de expiração
    :local posExpires [:find $comentario "EXPIRES:"]
    :local posDuration [:find $comentario "|DURATION:"]
    :if ($posExpires >= 0 and $posDuration >= 0) do={
        :local tempoExpiraStr [:pick $comentario ($posExpires + 8) $posDuration]
        :log info ("[DEBUG] Tempo extraido: '$tempoExpiraStr'")
        
        # Encontrar último "-"
        :local ultimoTraco -1
        :local i 0
        :while ($i < [:len $tempoExpiraStr]) do={
            :local char [:pick $tempoExpiraStr $i ($i+1)]
            :if ($char = "-") do={
                :set ultimoTraco $i
                :log info ("[DEBUG] Traco encontrado na posicao: $i")
            }
            :set i ($i + 1)
        }
        
        :log info ("[DEBUG] Ultimo traco na posicao: $ultimoTraco")
        
        :if ($ultimoTraco >= 0) do={
            :local dataExpira [:pick $tempoExpiraStr 0 $ultimoTraco]
            :local horaExpira [:pick $tempoExpiraStr ($ultimoTraco + 1) ([:len $tempoExpiraStr])]
            
            :log info ("[DEBUG] Data expira: '$dataExpira'")
            :log info ("[DEBUG] Hora expira: '$horaExpira'")
            
            # Converter data de hoje
            :log info ("[DEBUG] Convertendo data do sistema: '$hoje'")
            
            :local posBarraHoje1 [:find $hoje "/"]
            :local posBarraHoje2 [:find $hoje "/" ($posBarraHoje1 + 1)]
            
            :log info ("[DEBUG] Posicao primeira barra: $posBarraHoje1")
            :log info ("[DEBUG] Posicao segunda barra: $posBarraHoje2")
            
            :if ($posBarraHoje1 >= 0 and $posBarraHoje2 >= 0) do={
                :local mesStr [:pick $hoje 0 $posBarraHoje1]
                :local diaStr [:pick $hoje ($posBarraHoje1 + 1) $posBarraHoje2]
                :local anoStr [:pick $hoje ($posBarraHoje2 + 1) [:len $hoje]]
                
                :log info ("[DEBUG] Mes extraido: '$mesStr'")
                :log info ("[DEBUG] Dia extraido: '$diaStr'")
                :log info ("[DEBUG] Ano extraido: '$anoStr'")
                
                # Converter mês - ATTENTION: Mikrotik pode estar em português!
                :local mesNum "00"
                :if ($mesStr = "jan") do={ :set mesNum "01" }
                :if ($mesStr = "fev") do={ :set mesNum "02" }  # português
                :if ($mesStr = "feb") do={ :set mesNum "02" }  # inglês
                :if ($mesStr = "mar") do={ :set mesNum "03" }
                :if ($mesStr = "abr") do={ :set mesNum "04" }  # português
                :if ($mesStr = "apr") do={ :set mesNum "04" }  # inglês
                :if ($mesStr = "mai") do={ :set mesNum "05" }  # português
                :if ($mesStr = "may") do={ :set mesNum "05" }  # inglês
                :if ($mesStr = "jun") do={ :set mesNum "06" }
                :if ($mesStr = "jul") do={ :set mesNum "07" }
                :if ($mesStr = "ago") do={ :set mesNum "08" }  # português
                :if ($mesStr = "aug") do={ :set mesNum "08" }  # inglês
                :if ($mesStr = "set") do={ :set mesNum "09" }  # português
                :if ($mesStr = "sep") do={ :set mesNum "09" }  # inglês
                :if ($mesStr = "out") do={ :set mesNum "10" }  # português
                :if ($mesStr = "oct") do={ :set mesNum "10" }  # inglês
                :if ($mesStr = "nov") do={ :set mesNum "11" }
                :if ($mesStr = "dez") do={ :set mesNum "12" }  # português
                :if ($mesStr = "dec") do={ :set mesNum "12" }  # inglês
                
                :log info ("[DEBUG] Mes convertido: '$mesNum'")
                
                # Formatar dia
                :if ([:len $diaStr] = 1) do={ :set diaStr ("0" . $diaStr) }
                :log info ("[DEBUG] Dia formatado: '$diaStr'")
                
                :local dataHojeFormatada ($anoStr . "-" . $mesNum . "-" . $diaStr)
                :log info ("[DEBUG] Data hoje formatada: '$dataHojeFormatada'")
                
                # Comparar datas
                :log info ("[DEBUG] Comparando: '$dataExpira' vs '$dataHojeFormatada'")
                
                :if ($dataExpira = $dataHojeFormatada) do={
                    :log info ("[DEBUG] DATAS SAO IGUAIS - verificando hora")
                    
                    # Extrair hora
                    :local posDoisPontos [:find $horaExpira ":"]
                    :log info ("[DEBUG] Posicao dois pontos: $posDoisPontos")
                    
                    :if ($posDoisPontos >= 0) do={
                        :local horaExp [:tonum [:pick $horaExpira 0 $posDoisPontos]]
                        :local restante [:pick $horaExpira ($posDoisPontos + 1) [:len $horaExpira]]
                        :local posDoisPontos2 [:find $restante ":"]
                        :local minutoExp [:tonum [:pick $restante 0 $posDoisPontos2]]
                        
                        :log info ("[DEBUG] Hora expiracao: $horaExp")
                        :log info ("[DEBUG] Minuto expiracao: $minutoExp")
                        
                        :local minutosExpira ($horaExp * 60 + $minutoExp)
                        :log info ("[DEBUG] Minutos expiracao: $minutosExpira")
                        :log info ("[DEBUG] Minutos atuais: $minutosAtuais")
                        :log info ("[DEBUG] Condicao: $minutosAtuais >= $minutosExpira = " . ($minutosAtuais >= $minutosExpira))
                        
                        :if ($minutosAtuais >= $minutosExpira) do={
                            :log warning "[DEBUG] CONDICAO VERDADEIRA - DEVERIA REMOVER!"
                            :log warning "[DEBUG] Tentando remover binding..."
                            
                            :do {
                                /ip hotspot ip-binding remove $binding
                                :log info "[DEBUG] ✓ BINDING REMOVIDO COM SUCESSO!"
                            } on-error={
                                :log error "[DEBUG] ✗ ERRO AO REMOVER BINDING!"
                            }
                        } else={
                            :log info "[DEBUG] Ainda nao expirou"
                        }
                    }
                } else={
                    :log info ("[DEBUG] DATAS SAO DIFERENTES!")
                    :if ($dataExpira < $dataHojeFormatada) do={
                        :log info ("[DEBUG] Data de expiracao eh ANTERIOR - ja expirou")
                    } else={
                        :log info ("[DEBUG] Data de expiracao eh FUTURA")
                    }
                }
            } else={
                :log error "[DEBUG] ERRO ao extrair partes da data atual"
            }
        } else={
            :log error "[DEBUG] ERRO - nao encontrou ultimo traco"
        }
    } else={
        :log error "[DEBUG] ERRO - nao encontrou EXPIRES ou DURATION"
    }
} 