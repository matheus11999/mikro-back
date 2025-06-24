# =====================================================================
# SCRIPT MIKROTIK - VERIFICADOR DE MACS CONECTADOS
# =====================================================================
# 
# Este script consulta a API para obter MACs marcados como conectados
# e compara com os IP bindings ativos no MikroTik.
# Se um MAC está conectado na API mas não tem IP binding ativo,
# envia notificação de desconexão.
#
# CONFIGURAÇÃO:
# 1. Altere as variáveis abaixo com seus dados
# 2. Execute manualmente para testar
# 3. Crie scheduler para executar automaticamente (ex: a cada 5 minutos)
#
# =====================================================================

# CONFIGURAÇÕES - ALTERE ESTAS VARIÁVEIS
:local apiUrl "https://api.lucro.top"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local token "mtk_241ca9a5_cb1f8255"
:local debug true

# =====================================================================
# FUNÇÃO PARA LOG
# =====================================================================
:local logMsg do={
    :log info "[VERIFICADOR-CONECTADOS] $1"
    :if ($debug) do={ :put "[VERIFICADOR-CONECTADOS] $1" }
}

$logMsg "Iniciando verificação de MACs conectados"

# =====================================================================
# 1. CONSULTAR API PARA OBTER MACS CONECTADOS
# =====================================================================

:local conectadosUrl "$apiUrl/api/mikrotik/conectados"
:local macsConectadosApi ""
:local apiSucesso false

$logMsg "Consultando MACs conectados na API..."

:do {
    :local postData "{\"mikrotik_id\":\"$mikrotikId\",\"token\":\"$token\"}"
    
    /tool fetch url=$conectadosUrl http-method=post http-header-field="Content-Type: application/json" http-data=$postData dst-path="conectados-response.txt"
    :delay 2s
    
    :local response [/file get [find name="conectados-response.txt"] contents]
    /file remove [find name="conectados-response.txt"]
    
    # Extrair macs_string da resposta JSON (implementação simples)
    :local macsPos [:find $response "\"macs_string\":\""]
    :if ($macsPos >= 0) do={
        :set macsPos ($macsPos + 15)
        :local macsEnd [:find $response "\"" $macsPos]
        :if ($macsEnd >= 0) do={
            :set macsConectadosApi [:pick $response $macsPos $macsEnd]
            :set apiSucesso true
            $logMsg "MACs conectados na API: $macsConectadosApi"
        }
    }
    
} on-error={
    $logMsg "ERRO: Falha ao consultar API"
}

:if (!$apiSucesso) do={
    $logMsg "Abortando: Não foi possível obter MACs da API"
    :error "API indisponível"
}

:if ([:len $macsConectadosApi] = 0) do={
    $logMsg "Nenhum MAC conectado encontrado na API"
    :error "Lista vazia"
}

# =====================================================================
# 2. OBTER IP BINDINGS ATIVOS DO MIKROTIK
# =====================================================================

$logMsg "Obtendo IP bindings ativos..."

:local ipBindings ""
:foreach binding in=[/ip dhcp-server lease find where active=yes] do={
    :local macBinding [/ip dhcp-server lease get $binding mac-address]
    :if ([:len $macBinding] > 0) do={
        :if ([:len $ipBindings] = 0) do={
            :set ipBindings $macBinding
        } else={
            :set ipBindings "$ipBindings;$macBinding"
        }
    }
}

$logMsg "IP bindings ativos: $ipBindings"

# =====================================================================
# 3. COMPARAR E IDENTIFICAR MACS DESCONECTADOS
# =====================================================================

$logMsg "Comparando MACs conectados vs IP bindings..."

:global pixMacsDesconectar ""
:local pos 0
:local totalVerificados 0
:local totalDesconectados 0

# Processar cada MAC da API
:while ([:find $macsConectadosApi ";" $pos] >= 0) do={
    :local fim [:find $macsConectadosApi ";" $pos]
    :local macApi [:pick $macsConectadosApi $pos $fim]
    
    :if ([:len $macApi] > 0) do={
        :set totalVerificados ($totalVerificados + 1)
        
        # Verificar se MAC tem IP binding ativo
        :local temBinding false
        :local posBinding 0
        
        :while ([:find $ipBindings ";" $posBinding] >= 0) do={
            :local fimBinding [:find $ipBindings ";" $posBinding]
            :local macBinding [:pick $ipBindings $posBinding $fimBinding]
            
            :if ($macApi = $macBinding) do={
                :set temBinding true
            }
            :set posBinding ($fimBinding + 1)
        }
        
        # Verificar último MAC (sem ;)
        :if (!$temBinding and $posBinding < [:len $ipBindings]) do={
            :local ultimoMacBinding [:pick $ipBindings $posBinding [:len $ipBindings]]
            :if ($macApi = $ultimoMacBinding) do={
                :set temBinding true
            }
        }
        
        :if (!$temBinding) do={
            $logMsg "MAC sem IP binding: $macApi - adicionando para desconexão"
            :set totalDesconectados ($totalDesconectados + 1)
            
            :if ([:len $pixMacsDesconectar] = 0) do={
                :set pixMacsDesconectar $macApi
            } else={
                :set pixMacsDesconectar "$pixMacsDesconectar;$macApi"
            }
        } else={
            :if ($debug) do={ $logMsg "MAC com IP binding ativo: $macApi" }
        }
    }
    :set pos ($fim + 1)
}

# Verificar último MAC (sem ;)
:if ($pos < [:len $macsConectadosApi]) do={
    :local ultimoMacApi [:pick $macsConectadosApi $pos [:len $macsConectadosApi]]
    :if ([:len $ultimoMacApi] > 0) do={
        :set totalVerificados ($totalVerificados + 1)
        
        :local temBinding false
        :local posBinding 0
        
        :while ([:find $ipBindings ";" $posBinding] >= 0) do={
            :local fimBinding [:find $ipBindings ";" $posBinding]
            :local macBinding [:pick $ipBindings $posBinding $fimBinding]
            
            :if ($ultimoMacApi = $macBinding) do={
                :set temBinding true
            }
            :set posBinding ($fimBinding + 1)
        }
        
        :if (!$temBinding and $posBinding < [:len $ipBindings]) do={
            :local ultimoMacBinding [:pick $ipBindings $posBinding [:len $ipBindings]]
            :if ($ultimoMacApi = $ultimoMacBinding) do={
                :set temBinding true
            }
        }
        
        :if (!$temBinding) do={
            $logMsg "MAC sem IP binding: $ultimoMacApi - adicionando para desconexão"
            :set totalDesconectados ($totalDesconectados + 1)
            
            :if ([:len $pixMacsDesconectar] = 0) do={
                :set pixMacsDesconectar $ultimoMacApi
            } else={
                :set pixMacsDesconectar "$pixMacsDesconectar;$ultimoMacApi"
            }
        }
    }
}

# =====================================================================
# 4. ENVIAR NOTIFICAÇÕES DE DESCONEXÃO
# =====================================================================

$logMsg "Verificação concluída: $totalVerificados MACs verificados, $totalDesconectados para desconectar"

:if ($totalDesconectados > 0) do={
    $logMsg "MACs para desconectar: $pixMacsDesconectar"
    
    # Usar o mesmo padrão do seu script de notificação
    :local urlNotif "$apiUrl/api/mikrotik/auth-notification"
    :local pos 0
    :local sucessos 0
    :local total 0

    :while ([:find $pixMacsDesconectar ";" $pos] >= 0) do={
        :local fim [:find $pixMacsDesconectar ";" $pos]
        :local mac [:pick $pixMacsDesconectar $pos $fim]
        :if ([:len $mac] > 0) do={
            :set total ($total + 1)
            :if ($debug) do={ $logMsg "Processando desconexão: $mac" }
            :local data "{\"token\":\"$token\",\"mac_address\":\"$mac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"disconnect\"}"
            :local tentativa 1
            :local enviado false
            :while ($tentativa <= 3 and !$enviado) do={
                :if ($debug) do={ $logMsg "Tentativa $tentativa desconexão: $mac" }
                :do {
                    /tool fetch url=$urlNotif http-method=post http-header-field="Content-Type: application/json" http-data=$data keep-result=no
                    :set enviado true
                    :set sucessos ($sucessos + 1)
                    :if ($debug) do={ $logMsg "Sucesso desconexão: $mac" }
                } on-error={
                    :if ($debug) do={ $logMsg "Erro tentativa $tentativa desconexão: $mac" }
                    :set tentativa ($tentativa + 1)
                    :if ($tentativa <= 3) do={ :delay 1s }
                }
            }
            :if (!$enviado) do={
                $logMsg "Falha total desconexão: $mac"
            }
        }
        :set pos ($fim + 1)
    }

    # Processar último MAC se não termina com ;
    :if ($pos < [:len $pixMacsDesconectar]) do={
        :local mac [:pick $pixMacsDesconectar $pos [:len $pixMacsDesconectar]]
        :if ([:len $mac] > 0) do={
            :set total ($total + 1)
            :if ($debug) do={ $logMsg "Processando desconexão (último): $mac" }
            :local data "{\"token\":\"$token\",\"mac_address\":\"$mac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"disconnect\"}"
            :local tentativa 1
            :local enviado false
            :while ($tentativa <= 3 and !$enviado) do={
                :if ($debug) do={ $logMsg "Tentativa $tentativa desconexão: $mac" }
                :do {
                    /tool fetch url=$urlNotif http-method=post http-header-field="Content-Type: application/json" http-data=$data keep-result=no
                    :set enviado true
                    :set sucessos ($sucessos + 1)
                    :if ($debug) do={ $logMsg "Sucesso desconexão: $mac" }
                } on-error={
                    :if ($debug) do={ $logMsg "Erro tentativa $tentativa desconexão: $mac" }
                    :set tentativa ($tentativa + 1)
                    :if ($tentativa <= 3) do={ :delay 1s }
                }
            }
            :if (!$enviado) do={
                $logMsg "Falha total desconexão: $mac"
            }
        }
    }

    :if ($sucessos = $total and $total > 0) do={
        :set pixMacsDesconectar ""
        $logMsg "Todas desconexões enviadas - variável limpa ($sucessos/$total)"
    } else={
        $logMsg "Falhas detectadas - variável mantida ($sucessos/$total)"
    }
} else={
    $logMsg "Nenhum MAC precisa ser desconectado"
}

$logMsg "Verificador de conectados finalizado" 