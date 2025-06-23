:local apiUrl "https://api.lucro.top/api/recent-sales/78957cd3-7096-4acd-970b-0aa0a768c555"
:local authUrl "https://api.lucro.top/api/mikrotik/auth-notification"
:local mikrotikId "78957cd3-7096-4acd-970b-0aa0a768c555"
:local authToken "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3"

:log info "=== PIX SCRIPT COM FALLBACK INICIADO ==="

:local notificarComFallback do={
    :local mac $1
    :local acao $2
    :local payload "{\"token\":\"$authToken\",\"mac_address\":\"$mac\",\"mikrotik_id\":\"$mikrotikId\",\"action\":\"$acao\"}"
    
    :log info "Tentando notificar $acao para $mac..."
    
    # Tentativa 1: Normal
    :local sucesso false
    :do {
        /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload
        :delay 2s
        :set sucesso true
        :log info "✓ API notificada (tentativa 1): $acao para $mac"
    } on-error={
        :log warning "✗ Tentativa 1 falhou: $acao para $mac"
    }
    
    # Tentativa 2: Com timeout maior
    :if (!$sucesso) do={
        :do {
            /tool fetch url=$authUrl http-method=post http-header-field="Content-Type: application/json" http-data=$payload timeout=10
            :delay 3s
            :set sucesso true
            :log info "✓ API notificada (tentativa 2): $acao para $mac"
        } on-error={
            :log warning "✗ Tentativa 2 falhou: $acao para $mac"
        }
    }
    
    # Tentativa 3: Método GET com parâmetros na URL
    :if (!$sucesso) do={
        :local urlGet ($authUrl . "?token=" . $authToken . "&mac_address=" . $mac . "&mikrotik_id=" . $mikrotikId . "&action=" . $acao)
        :do {
            /tool fetch url=$urlGet http-method=get timeout=15
            :delay 3s
            :set sucesso true
            :log info "✓ API notificada (tentativa 3 GET): $acao para $mac"
        } on-error={
            :log warning "✗ Tentativa 3 GET falhou: $acao para $mac"
        }
    }
    
    # Tentativa 4: POST simples sem headers específicos
    :if (!$sucesso) do={
        :do {
            /tool fetch url=$authUrl http-method=post http-data=$payload timeout=20
            :delay 4s
            :set sucesso true
            :log info "✓ API notificada (tentativa 4 simples): $acao para $mac"
        } on-error={
            :log warning "✗ Tentativa 4 simples falhou: $acao para $mac"
        }
    }
    
    # Se todas falharam
    :if (!$sucesso) do={
        :log error "✗ TODAS as tentativas de notificacao falharam para $acao/$mac"
        :log error "✗ Sistema continua funcionando, mas API nao foi notificada"
    }
    
    :return $sucesso
}

:log info "Buscando vendas da API..."
/tool fetch url=$apiUrl http-method=get dst-path="vendas.txt"
:delay 3s

:local vendas [/file get [find name="vendas.txt"] contents]
/file remove [find name="vendas.txt"]

:if ([:len $vendas] = 0) do={
    :log info "Nenhuma venda encontrada"
    return
}

:log info "Dados recebidos: $vendas"

:local pos [:find $vendas "-"]
:if ($pos < 0) do={
    :log error "Formato invalido: $vendas"
    return
}

:local mac [:pick $vendas 0 $pos]
:local minStr [:pick $vendas ($pos + 1) [:len $vendas]]

# Limpar quebras de linha
:local i 0
:local minLimpo ""
:while ($i < [:len $minStr]) do={
    :local char [:pick $minStr $i ($i+1)]
    :if ($char != "\n" and $char != "\r" and $char != " ") do={
        :set minLimpo ($minLimpo . $char)
    }
    :set i ($i + 1)
}

:local minutos [:tonum $minLimpo]

:log info "Processando: MAC=$mac, Minutos=$minutos"

# Remover bindings anteriores
:log info "Removendo bindings anteriores..."
:do { /ip hotspot ip-binding remove [find mac-address=$mac] } on-error={}

# Calcular data/hora de expiração
:log info "Calculando data/hora de expiracao..."
:local agora [/system clock get time]
:local hoje [/system clock get date]
:local h [:tonum [:pick $agora 0 [:find $agora ":"]]]
:local m [:tonum [:pick $agora 3 5]]

:local totalMin (($h * 60) + $m + $minutos)
:local novaH ($totalMin / 60)
:local novaM ($totalMin % 60)

# Converter data para formato numérico
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

:local hs [:tostr $novaH]
:local ms [:tostr $novaM]
:if ([:len $hs] = 1) do={ :set hs ("0" . $hs) }
:if ([:len $ms] = 1) do={ :set ms ("0" . $ms) }

:local dataExpire ($ano . $mesNum . $diaStr . "-" . $hs . $ms)
:local comentario ("PIX-EXPIRE-" . $dataExpire . "-" . $mac)

:log info "Criando IP binding com comentario: $comentario"
/ip hotspot ip-binding add mac-address=$mac type=bypassed comment=$comentario
:log info "IP Binding criado para $mac"

:log info "Tentando notificar connect com sistema de fallback..."
:local notifSucesso [$notificarComFallback $mac "connect"]

:if ($notifSucesso) do={
    :log info "✓ Notificacao de connect bem-sucedida"
} else={
    :log warning "✗ Notificacao de connect falhou em todas as tentativas"
    :log warning "✗ Binding criado mas API nao foi notificada"
}

:log info "Comentario para limpeza: $comentario"
:log info "=== PIX SCRIPT COM FALLBACK CONCLUIDO ===" 