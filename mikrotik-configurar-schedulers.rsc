:log info "=== CONFIGURANDO SCHEDULERS PIX ==="

:log info "Removendo schedulers antigos..."
:do { /system scheduler remove [find name="pix-processar-vendas"] } on-error={}
:do { /system scheduler remove [find name="pix-limpeza-automatica"] } on-error={}

:log info "Criando scheduler para processar vendas (a cada 2 minutos)..."
/system scheduler add \
    name="pix-processar-vendas" \
    interval=2m \
    start-time=startup \
    on-event="/system script run mikrotik-principal-completo"

:log info "Criando scheduler para limpeza automatica (a cada 10 minutos)..."  
/system scheduler add \
    name="pix-limpeza-automatica" \
    interval=10m \
    start-time=startup \
    on-event="/system script run mikrotik-limpeza-completa"

:log info "=== SCHEDULERS CONFIGURADOS ==="
:log info "1. pix-processar-vendas: Executa a cada 2 minutos"
:log info "2. pix-limpeza-automatica: Executa a cada 10 minutos"
:log info ""
:log info "Para verificar: /system scheduler print"
:log info "Para parar: /system scheduler disable [find name~\"pix-\"]"
:log info "Para iniciar: /system scheduler enable [find name~\"pix-\"]" 