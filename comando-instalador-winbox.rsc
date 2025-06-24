# Comando para executar no terminal do WinBox
# Substitua SEU_MIKROTIK_ID e SEU_TOKEN pelos valores reais

# 1. Fazer request para gerar scripts
/tool fetch url="https://api.lucro.top/api/mikrotik/install-scripts" http-method=post http-header-field="Content-Type: application/json" http-data="{\"mikrotik_id\":\"SEU_MIKROTIK_ID\",\"token\":\"SEU_TOKEN\"}" dst-path="pix-installer.txt"

# 2. Aguardar 3 segundos para download
:delay 3s

# 3. Visualizar o resultado
/file get [find name="pix-installer.txt"] contents

# 4. Remover arquivo temporário
/file remove [find name="pix-installer.txt"]

# ============================================
# EXEMPLO COM VALORES REAIS (SUBSTITUA OS SEUS)
# ============================================

# /tool fetch url="https://api.lucro.top/api/mikrotik/install-scripts" http-method=post http-header-field="Content-Type: application/json" http-data="{\"mikrotik_id\":\"78957cd3-7096-4acd-970b-0aa0a768c555\",\"token\":\"mtk_241ca9a5_cb1f8255\"}" dst-path="pix-installer.txt"

# ============================================
# ALTERNATIVA: COMANDO EM UMA LINHA SÓ
# ============================================

# /tool fetch url="https://api.lucro.top/api/mikrotik/install-scripts" http-method=post http-header-field="Content-Type: application/json" http-data="{\"mikrotik_id\":\"SEU_MIKROTIK_ID\",\"token\":\"SEU_TOKEN\"}" dst-path="pix-installer.txt"; :delay 3s; /file get [find name="pix-installer.txt"] contents; /file remove [find name="pix-installer.txt"]

# ============================================
# INSTRUÇÕES:
# ============================================
# 1. Substitua SEU_MIKROTIK_ID pelo ID do seu MikroTik
# 2. Substitua SEU_TOKEN pelo token do seu MikroTik  
# 3. Cole o comando no terminal do WinBox
# 4. Execute e aguarde o resultado
# 5. Copie os comandos retornados e execute-os
# ============================================ 