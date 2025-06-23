# =====================================================================
# SCRIPT MIKROTIK - HEARTBEAT MONITOR PERSONALIZADO
# =====================================================================
# 
# Script configurado para:
# - API: api.lucro.top
# - Token: mtk_241ca9a5_cb1f8255
#
# ATENÇÃO: Você ainda precisa configurar o mikrotikId!
#
# =====================================================================

# CONFIGURAÇÕES - ALTERE APENAS O MIKROTIK_ID
:local apiUrl "https://api.lucro.top/api/mikrotik/heartbeat"
:local mikrotikId "COLE_AQUI_O_ID_DO_SEU_MIKROTIK"
:local apiToken "mtk_241ca9a5_cb1f8255"

# =====================================================================
# VALIDAÇÃO DAS CONFIGURAÇÕES
# =====================================================================

:if ($mikrotikId = "COLE_AQUI_O_ID_DO_SEU_MIKROTIK") do={
    :log error "[HEARTBEAT] ERRO: Configure a variável 'mikrotikId' com o ID do seu MikroTik"
    :put "ERRO: Configure a variável 'mikrotikId' no script" 
    :put "Acesse o painel admin e copie o ID do seu MikroTik"
    :error "Configuração pendente - mikrotikId"
}

# =====================================================================
# COLETA DE INFORMAÇÕES DO SISTEMA
# =====================================================================

:log info "[HEARTBEAT] Iniciando coleta de informações do sistema..."

:local systemInfo
:local version "Desconhecida"
:local uptime "Desconhecido"

# Executar /system resource print e capturar saída
:do {
    :set systemInfo [/system resource print as-value]
    
    # Extrair versão
    :if ([:len $systemInfo] > 0) do={
        :set version [:pick ([/system package get value-name=version [find name=routeros]]) 0 50]
    }
    
    # Extrair uptime  
    :if ([:len $systemInfo] > 0) do={
        :set uptime [:tostr [$systemInfo->"uptime"]]
    }
    
    :log info "[HEARTBEAT] Informações coletadas - Versão: $version, Uptime: $uptime"
    
} on-error={
    :log warning "[HEARTBEAT] Erro ao coletar informações do sistema, usando valores padrão"
    :set version "Erro ao coletar"
    :set uptime "Erro ao coletar"
}

# =====================================================================
# PREPARAÇÃO DO PAYLOAD JSON
# =====================================================================

:local jsonPayload "{"
:set jsonPayload ($jsonPayload . "\"mikrotik_id\":\"" . $mikrotikId . "\",")
:set jsonPayload ($jsonPayload . "\"token\":\"" . $apiToken . "\",")
:set jsonPayload ($jsonPayload . "\"version\":\"" . $version . "\",")
:set jsonPayload ($jsonPayload . "\"uptime\":\"" . $uptime . "\"")
:set jsonPayload ($jsonPayload . "}")

:log info "[HEARTBEAT] Payload preparado para api.lucro.top"

# =====================================================================
# ENVIO DO HEARTBEAT
# =====================================================================

:log info "[HEARTBEAT] Enviando heartbeat para: $apiUrl"

:local httpResult
:local httpStatus "erro"

:do {
    :set httpResult [/tool fetch \
        url=$apiUrl \
        http-method=post \
        http-header-field="Content-Type: application/json" \
        http-data=$jsonPayload \
        as-value \
        output=user \
        duration=15
    ]
    
    :set httpStatus [:tostr ($httpResult->"status")]
    :log info "[HEARTBEAT] Resposta HTTP recebida - Status: $httpStatus"
    
    # Verificar se foi bem-sucedido
    :if ($httpStatus = "finished") do={
        :log info "[HEARTBEAT] ✅ Heartbeat enviado com sucesso para api.lucro.top!"
        :put "[HEARTBEAT] ✅ Sucesso - Heartbeat registrado na API"
        
        # Log detalhado da resposta se disponível
        :local responseData ($httpResult->"data")
        :if ([:len $responseData] > 0) do={
            :log info "[HEARTBEAT] Resposta da API: $responseData"
        }
        
    } else={
        :log warning "[HEARTBEAT] ⚠️ Status HTTP inesperado: $httpStatus"
        :put "[HEARTBEAT] ⚠️ Status: $httpStatus"
    }
    
} on-error={
    :log error "[HEARTBEAT] ❌ Erro ao enviar heartbeat para api.lucro.top"
    :put "[HEARTBEAT] ❌ Erro na comunicação com a API"
    
    # Verificar conectividade básica
    :do {
        :local pingResult [/ping address=8.8.8.8 count=2]
        :if ($pingResult > 0) do={
            :log info "[HEARTBEAT] Internet OK - Problema pode estar na API"
            
            # Tentar ping para o servidor
            :do {
                :local apiPing [/ping address=api.lucro.top count=2]
                :if ($apiPing > 0) do={
                    :log info "[HEARTBEAT] Servidor api.lucro.top está respondendo"
                } else={
                    :log error "[HEARTBEAT] Servidor api.lucro.top não está respondendo"
                }
            } on-error={
                :log error "[HEARTBEAT] Erro ao fazer ping para api.lucro.top"
            }
            
        } else={
            :log error "[HEARTBEAT] Sem conectividade com a internet"
        }
    } on-error={
        :log error "[HEARTBEAT] Erro ao verificar conectividade"
    }
    
    :error "Falha na comunicação"
}

# =====================================================================
# LOG FINAL
# =====================================================================

:log info "[HEARTBEAT] Script executado em: $[/system clock get time] $[/system clock get date]"
:put "[HEARTBEAT] Execução concluída - Token: mtk_241ca9a5_cb1f8255"
:put "[HEARTBEAT] API: api.lucro.top"

# =====================================================================
# INSTRUÇÕES DE INSTALAÇÃO
# =====================================================================
#
# 1. PRIMEIRO: Configure o mikrotikId na linha 14 deste script
#    - Acesse seu painel admin
#    - Vá em MikroTiks e copie o ID do seu equipamento
#    - Cole no lugar de "COLE_AQUI_O_ID_DO_SEU_MIKROTIK"
#
# 2. CRIAR O SCRIPT:
#    /system script add name="heartbeat-lucro" source="[COLE TODO ESTE CÓDIGO AQUI]"
#
# 3. TESTAR O SCRIPT:
#    /system script run heartbeat-lucro
#
# 4. CRIAR SCHEDULER (após testar):
#    /system scheduler add \
#      name="heartbeat-monitor" \
#      interval=00:05:00 \
#      start-time=startup \
#      comment="Heartbeat para api.lucro.top a cada 5 minutos" \
#      on-event="/system script run heartbeat-lucro"
#
# =====================================================================
# COMANDOS ÚTEIS
# =====================================================================
#
# Ver logs do script:
# /log print where topics~"script"
#
# Ver status do scheduler:
# /system scheduler print
#
# Executar manualmente:
# /system script run heartbeat-lucro
#
# Parar scheduler:
# /system scheduler set heartbeat-monitor disabled=yes
#
# Reativar scheduler:
# /system scheduler set heartbeat-monitor disabled=no
#
# ===================================================================== 