# =====================================================================
# SCRIPT MIKROTIK - HEARTBEAT MONITOR COM TOKEN INDIVIDUAL
# =====================================================================
# 
# Este script envia heartbeats regulares para a API do sistema,
# utilizando o token individual do MikroTik para autenticação.
#
# COMO CONFIGURAR:
# 1. Configure as variáveis abaixo com os dados do seu MikroTik
# 2. Execute este script para testar se funciona
# 3. Crie um scheduler para executar automaticamente
#
# =====================================================================

# CONFIGURAÇÕES - ALTERE ESTAS VARIÁVEIS
:local apiUrl "http://SEU_SERVIDOR:3000/api/mikrotik/heartbeat"
:local mikrotikId "SEU_MIKROTIK_ID_AQUI"
:local apiToken "SEU_TOKEN_INDIVIDUAL_AQUI"

# =====================================================================
# VALIDAÇÃO DAS CONFIGURAÇÕES
# =====================================================================

:if ($apiUrl = "http://SEU_SERVIDOR:3000/api/mikrotik/heartbeat") do={
    :log error "[HEARTBEAT] ERRO: Configure a variável 'apiUrl' com o endereço correto da sua API"
    :put "ERRO: Configure a variável 'apiUrl' no script"
    :error "Configuração pendente"
}

:if ($mikrotikId = "SEU_MIKROTIK_ID_AQUI") do={
    :log error "[HEARTBEAT] ERRO: Configure a variável 'mikrotikId' com o ID do seu MikroTik"
    :put "ERRO: Configure a variável 'mikrotikId' no script" 
    :error "Configuração pendente"
}

:if ($apiToken = "SEU_TOKEN_INDIVIDUAL_AQUI") do={
    :log error "[HEARTBEAT] ERRO: Configure a variável 'apiToken' com o token individual do seu MikroTik"
    :put "ERRO: Configure a variável 'apiToken' no script"
    :error "Configuração pendente"
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

:log info "[HEARTBEAT] Payload preparado: $jsonPayload"

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
        duration=10
    ]
    
    :set httpStatus [:tostr ($httpResult->"status")]
    :log info "[HEARTBEAT] Resposta HTTP recebida - Status: $httpStatus"
    
    # Verificar se foi bem-sucedido
    :if ($httpStatus = "finished") do={
        :log info "[HEARTBEAT] ✅ Heartbeat enviado com sucesso!"
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
    :log error "[HEARTBEAT] ❌ Erro ao enviar heartbeat para a API"
    :put "[HEARTBEAT] ❌ Erro na comunicação com a API"
    
    # Verificar conectividade básica
    :do {
        :local pingResult [/ping address=8.8.8.8 count=2]
        :if ($pingResult > 0) do={
            :log info "[HEARTBEAT] Internet OK - Problema pode estar na API"
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

:log info "[HEARTBEAT] Script executado com sucesso em: $[/system clock get time] $[/system clock get date]"
:put "[HEARTBEAT] Execução concluída - Verifique os logs para detalhes"

# =====================================================================
# INSTRUÇÕES PARA CRIAR SCHEDULER
# =====================================================================
#
# Execute os comandos abaixo para criar um scheduler que executa
# este script a cada 5 minutos:
#
# /system scheduler add \
#   name="heartbeat-monitor" \
#   interval=00:05:00 \
#   start-time=startup \
#   comment="Envia heartbeat para a API a cada 5 minutos" \
#   on-event="/system script run heartbeat-script"
#
# Substitua "heartbeat-script" pelo nome que você deu a este script
#
# =====================================================================
# COMANDOS ÚTEIS PARA GERENCIAMENTO
# =====================================================================
#
# Ver status do scheduler:
# /system scheduler print
#
# Executar manualmente:
# /system script run heartbeat-script
#
# Parar o scheduler:
# /system scheduler set heartbeat-monitor disabled=yes
#
# Iniciar o scheduler:
# /system scheduler set heartbeat-monitor disabled=no
#
# Remover o scheduler:
# /system scheduler remove heartbeat-monitor
#
# Ver logs:
# /log print where topics~"script"
#
# ===================================================================== 