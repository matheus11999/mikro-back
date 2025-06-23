# TESTE DE CAPTURA DE DADOS DO SISTEMA
:put "=== TESTE CAPTURA DADOS ==="

# Testar captura de dados do sistema
:local systemInfo [/system resource print as-value]
:put "Dados capturados:"
:put $systemInfo

:put ""
:put "=== EXTRAINDO CAMPOS ==="

# Verificar se há dados
:if ([:len $systemInfo] > 0) do={
    :local firstItem ($systemInfo->0)
    :put "Primeiro item:"
    :put $firstItem
    
    :put ""
    :put "=== CAMPOS INDIVIDUAIS ==="
    
    # Tentar extrair versão
    :local version ""
    :do {
        :set version ($firstItem->"version")
        :put "Versão capturada: $version"
    } on-error={
        :put "ERRO ao capturar versão"
    }
    
    # Tentar extrair uptime
    :local uptime ""
    :do {
        :set uptime ($firstItem->"uptime")
        :put "Uptime capturado: $uptime"
    } on-error={
        :put "ERRO ao capturar uptime"
    }
    
    :put ""
    :put "=== TESTE JSON ==="
    
    # Preparar JSON
    :local json "{\"version\":\"$version\",\"uptime\":\"$uptime\"}"
    :put "JSON gerado: $json"
    
} else={
    :put "ERRO: Nenhum dado retornado do /system resource"
}

:put ""
:put "=== TESTE ALTERNATIVO ==="

# Método alternativo
:do {
    :local sysInfo [/system resource get]
    :put "Método alternativo - dados:"
    :put $sysInfo
} on-error={
    :put "ERRO no método alternativo"
}

:put "=== FIM TESTE ===" 