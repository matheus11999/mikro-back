# Comando para executar no terminal do WinBox
# Substitua SEU_MIKROTIK_ID e SEU_TOKEN pelos valores reais

# COMANDO CORRETO (usar api.lucro.top):
/tool fetch url="https://api.lucro.top/api/mikrotik/install-scripts" http-method=post http-header-field="Content-Type: application/json" http-data="{\"mikrotik_id\":\"SEU_MIKROTIK_ID\",\"token\":\"SEU_TOKEN\"}" dst-path="pix-installer.txt"; :delay 3s; /file get [find name="pix-installer.txt"] contents; /file remove [find name="pix-installer.txt"]

# ============================================
# EXPLICAÇÃO DAS URLs:
# ============================================
# api.lucro.top - API principal (onde está o endpoint install-scripts)
# api.mikropix.online - API de vendas (recent-sales, heartbeat)
# ============================================

# EXEMPLO COM VALORES REAIS (SUBSTITUA OS SEUS):
# /tool fetch url="https://api.lucro.top/api/mikrotik/install-scripts" http-method=post http-header-field="Content-Type: application/json" http-data="{\"mikrotik_id\":\"78957cd3-7096-4acd-970b-0aa0a768c555\",\"token\":\"mtk_241ca9a5_cb1f8255\"}" dst-path="pix-installer.txt"; :delay 3s; /file get [find name="pix-installer.txt"] contents; /file remove [find name="pix-installer.txt"]