# TESTE BÁSICO DE HEARTBEAT
:put "=== TESTE HEARTBEAT ==="

# Configurações
:local url "https://api.lucro.top/api/mikrotik/heartbeat"
:local id "78957cd3-7096-4acd-970b-0aa0a768c555"
:local token "mtk_241ca9a5_cb1f8255"

# Capturar dados do sistema
:local res [/system resource print as-value]
:local ver ($res->0->"version")
:local up ($res->0->"uptime")

:put "Versão: $ver"
:put "Uptime: $up"

# Preparar JSON
:local json "{\"mikrotik_id\":\"$id\",\"token\":\"$token\",\"version\":\"$ver\",\"uptime\":\"$up\"}"

:put "JSON: $json"

# Enviar
:do {
    :local result [/tool fetch url=$url http-method=post http-header-field="Content-Type:application/json" http-data=$json as-value]
    :put "Resultado: $($result->\"status\")"
} on-error={
    :put "ERRO no envio"
}

:put "=== FIM TESTE ===" 