:put "=== TESTE DE COMANDOS BASICOS ==="

:put "1. Testando variaveis..."
:local teste "valor"
:if ($teste = "valor") do={
    :put "1. OK - Variaveis funcionam"
} else={
    :put "1. ERRO - Variaveis nao funcionam"
}

:put "2. Testando clock..."
:local agora [/system clock get time]
:put "2. OK - Horario atual: $agora"

:put "3. Testando math..."
:local num1 10
:local num2 5
:local soma ($num1 + $num2)
:put "3. OK - 10 + 5 = $soma"

:put "4. Testando strings..."
:local str "teste-123"
:local pos [:find $str "-"]
:local parte1 [:pick $str 0 $pos]
:local parte2 [:pick $str ($pos + 1) [:len $str]]
:put "4. OK - String: $str -> $parte1 e $parte2"

:put "5. Testando fetch simples..."
:do {
    /tool fetch url="https://api.lucro.top/api/planos" http-method=get dst-path="teste-cmd.txt"
    :delay 2s
    :local resultado [/file get [find name="teste-cmd.txt"] contents]
    /file remove [find name="teste-cmd.txt"]
    :put "5. OK - Fetch funcionou, tamanho: [:len $resultado]"
} on-error={
    :put "5. ERRO - Fetch nao funcionou"
}

:put "6. Testando hotspot binding..."
:do {
    /ip hotspot ip-binding add mac-address=FF:FF:FF:FF:FF:FF type=bypassed comment="TESTE-CMD"
    :put "6a. OK - Binding criado"
    
    /ip hotspot ip-binding remove [find mac-address=FF:FF:FF:FF:FF:FF]
    :put "6b. OK - Binding removido"
} on-error={
    :put "6. ERRO - Hotspot binding nao funcionou"
}

:put "7. Testando scheduler..."
:do {
    /system scheduler add name="teste-cmd" start-time=23:59:59 interval=0 on-event=":put \"teste\"" comment="TESTE"
    :put "7a. OK - Scheduler criado"
    
    /system scheduler remove [find name="teste-cmd"]
    :put "7b. OK - Scheduler removido"
} on-error={
    :put "7. ERRO - Scheduler nao funcionou"
}

:put "8. Testando conversao..."
:local numStr "123"
:local numVal [:tonum $numStr]
:if ($numVal = 123) do={
    :put "8. OK - Conversao funciona"
} else={
    :put "8. ERRO - Conversao nao funciona"
}

:put "=== TESTE FINALIZADO ===" 