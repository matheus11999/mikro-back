:log info "=== CONFIGURANDO SCHEDULERS COM FALLBACK ==="

:log info "Removendo schedulers antigos..."
:do { /system scheduler remove [find name="pix-processar-vendas"] } on-error={}
:do { /system scheduler remove [find name="pix-limpeza-automatica"] } on-error={}
:do { /system scheduler remove [find name="pix-processar-vendas-fallback"] } on-error={}
:do { /system scheduler remove [find name="pix-limpeza-fallback"] } on-error={}

:log info "Criando scheduler para processar vendas COM FALLBACK (a cada 2 minutos)..."
/system scheduler add \
    name="pix-processar-vendas-fallback" \
    interval=2m \
    start-time=startup \
    on-event="/system script run mikrotik-principal-fallback"

:log info "Criando scheduler para limpeza COM FALLBACK (a cada 10 minutos)..."  
/system scheduler add \
    name="pix-limpeza-fallback" \
    interval=10m \
    start-time=startup \
    on-event="/system script run mikrotik-limpeza-fallback"

:log info "=== SCHEDULERS COM FALLBACK CONFIGURADOS ==="
:log info "1. pix-processar-vendas-fallback: Executa a cada 2 minutos"
:log info "2. pix-limpeza-fallback: Executa a cada 10 minutos"
:log info ""
:log info "FALLBACK CONFIGURADO:"
:log info "- 4 tentativas de notificacao para cada acao"
:log info "- Timeouts progressivos: 3s, 10s, 15s, 20s"
:log info "- Metodos: POST JSON, POST timeout, GET params, POST simples"
:log info "- Sistema continua funcionando mesmo se notificacoes falharem"
:log info ""
:log info "Para verificar: /system scheduler print"
:log info "Para parar: /system scheduler disable [find name~\"pix-\"]"
:log info "Para iniciar: /system scheduler enable [find name~\"pix-\"]" 