# Script notificador PIX corrigido para funcionar com a API atual
# Usa o sistema de autenticação validarTokenMikrotik

:global pixMacsNotificar
:global pixAcaoNotificar

:log info "=== NOTIFICADOR PIX CORRIGIDO INICIADO ==="

# Verificar se as variáveis globais estão definidas
:if ([:typeof $pixMacsNotificar] = "nothing") do={
    :log error "Variável pixMacsNotificar não definida"
    :return
}

:if ([:typeof $pixAcaoNotificar] = "nothing") do={
    :log error "Variável pixAcaoNotificar não definida"
    :return
}

:log info "MACs para notificar: $pixMacsNotificar"
:log info "Ação: $pixAcaoNotificar"

# Configurações da API
:local apiUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local apiToken "mtk_241ca9a5_cb1f8255"

# Função para notificar um MAC com fallback
:local notificarMac do={
    :local mac $1
    :local acao $2
    :local tentativas 0
    :local sucesso false
    
    :log info "Processando notificação: $acao para MAC $mac"
    
    # JSON payload com autenticação correta
    :local jsonData "{\"mikrotik_id\":\"$mikrotikId\",\"token\":\"$apiToken\",\"mac_address\":\"$mac\",\"action\":\"$acao\"}"
    
    # Tentativas com fallback
    :while ($tentativas < 3 and !$sucesso) do={
        :set tentativas ($tentativas + 1)
        :log info "Tentativa $tentativas de notificação para $mac"
        
        :do {
            # Fazer requisição POST com timeout baseado na tentativa
            :local timeout (5 + ($tentativas * 3))
            /tool fetch url=$apiUrl http-method=post http-header-field="Content-Type:application/json" http-data=$jsonData dst-path="notif_$mac.txt" timeout=$timeout
            
            # Aguardar resposta
            :delay 2s
            
            # Tentar ler resposta (opcional)
            :local resposta ""
            :do {
                :set resposta [/file get [find name="notif_$mac.txt"] contents]
                :log info "Resposta da API para $mac: $resposta"
            } on-error={
                :log info "Resposta recebida mas não foi possível ler o arquivo"
            }
            
            # Limpar arquivo temporário
            :do {
                /file remove [find name="notif_$mac.txt"]
            } on-error={}
            
            :set sucesso true
            :log info "✓ Notificação enviada com sucesso para: $mac (tentativa $tentativas)"
            
        } on-error={
            :log warning "✗ Erro na tentativa $tentativas para $mac: $!"
            
            # Se não é a última tentativa, aguardar antes de tentar novamente
            :if ($tentativas < 3) do={
                :delay (2 * $tentativas)s
            }
        }
    }
    
    :if (!$sucesso) do={
        :log error "✗ Falha total na notificação para: $mac após 3 tentativas"
    }
    
    :return $sucesso
}

# Processar cada MAC na lista
:local pos 0
:local totalMacs 0
:local sucessos 0

:while ([:find $pixMacsNotificar ";" $pos] >= 0) do={
    :local fim [:find $pixMacsNotificar ";" $pos]
    :local mac [:pick $pixMacsNotificar $pos $fim]
    
    # Processar apenas MACs não vazios
    :if ([:len $mac] > 0) do={
        :set totalMacs ($totalMacs + 1)
        
        # Chamar função de notificação
        :local resultado [$notificarMac $mac $pixAcaoNotificar]
        
        :if ($resultado) do={
            :set sucessos ($sucessos + 1)
        }
        
        # Pequeno delay entre notificações para não sobrecarregar a API
        :delay 1s
    }
    
    :set pos ($fim + 1)
}

# Processar último MAC se não terminar com ";"
:if ($pos < [:len $pixMacsNotificar]) do={
    :local ultimoMac [:pick $pixMacsNotificar $pos [:len $pixMacsNotificar]]
    :if ([:len $ultimoMac] > 0) do={
        :set totalMacs ($totalMacs + 1)
        :local resultado [$notificarMac $ultimoMac $pixAcaoNotificar]
        :if ($resultado) do={
            :set sucessos ($sucessos + 1)
        }
    }
}

# Limpar variáveis globais
:set pixMacsNotificar
:set pixAcaoNotificar

:log info "=== NOTIFICADOR PIX FINALIZADO ==="
:log info "Total de MACs processados: $totalMacs"
:log info "Notificações bem-sucedidas: $sucessos"
:log info "Notificações falharam: " . ($totalMacs - $sucessos) 