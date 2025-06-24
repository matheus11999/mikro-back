# Instalador Automático de Scripts MikroTik

## Visão Geral

O endpoint `/api/mikrotik/install-scripts` permite gerar automaticamente todos os scripts necessários para configurar um MikroTik com o sistema PIX Mikro. O usuário precisa apenas fornecer o `mikrotik_id` e `token` para receber todos os comandos RouterOS prontos para execução.

## Endpoint

**POST** `/api/mikrotik/install-scripts`

### Autenticação

Utiliza o middleware `validarTokenMikrotik` que valida:
- `mikrotik_id`: ID do MikroTik no sistema
- `token`: Token de API do MikroTik

### Request Body

```json
{
  "mikrotik_id": "78957cd3-7096-4acd-970b-0aa0a768c555",
  "token": "mtk_241ca9a5_cb1f8255"
}
```

### Response

```json
{
  "success": true,
  "message": "Scripts gerados com sucesso",
  "mikrotik": {
    "id": "78957cd3-7096-4acd-970b-0aa0a768c555",
    "nome": "MikroTik Principal"
  },
  "scripts": {
    "full_installation": "# Script completo formatado para copiar/colar",
    "removal_commands": ["array de comandos de remoção"],
    "install_commands": ["array de comandos de instalação"],
    "scheduler_commands": ["array de comandos dos schedulers"]
  },
  "instructions": [
    "1. Copie os comandos abaixo",
    "2. Abra o terminal do WinBox",
    "3. Execute linha por linha ou cole tudo de uma vez",
    "4. Aguarde a conclusão da instalação",
    "5. Verifique os logs para confirmar funcionamento"
  ]
}
```

## Scripts Gerados

### 1. Notificador de Conexão (`pix-notifier-connect`)
- Processa MACs que se conectaram
- Envia notificações para a API
- Limpa variáveis globais após sucesso

### 2. Notificador de Desconexão (`pix-notifier-disconnect`) 
- Processa MACs que se desconectaram
- Envia notificações de desconexão
- Gerencia variável global `pixMacsDesconectar`

### 3. PIX Verificador (`pix-verificador`)
- Verifica vendas pendentes na API
- Cria bindings de IP para MACs aprovados
- Calcula tempos de expiração automaticamente
- Executa notificador de conexão quando necessário

### 4. Heartbeat (`pix-heartbeat`)
- Envia status do MikroTik para a API
- Inclui versão e uptime
- Mantém conexão ativa com o sistema

## Schedulers Configurados

- **pix-verificador-scheduler**: Executa a cada 30 segundos
- **pix-heartbeat-scheduler**: Executa a cada 5 minutos

## Como Usar

### 1. Via Terminal/WinBox

Execute no terminal do WinBox:

```bash
# Exemplo de uso via fetch
/tool fetch url="https://api.lucro.top/api/mikrotik/install-scripts" \
http-method=post \
http-header-field="Content-Type: application/json" \
http-data="{\"mikrotik_id\":\"SEU_ID\",\"token\":\"SEU_TOKEN\"}" \
dst-path="install.txt"

# Visualizar resultado
/file get [find name="install.txt"] contents
```

### 2. Via cURL (para testes)

```bash
curl -X POST https://api.lucro.top/api/mikrotik/install-scripts \
  -H "Content-Type: application/json" \
  -d '{
    "mikrotik_id": "78957cd3-7096-4acd-970b-0aa0a768c555",
    "token": "mtk_241ca9a5_cb1f8255"
  }'
```

## Comandos de Instalação Gerados

O endpoint retorna um script completo que inclui:

```routeros
# 1. Remoção de scripts existentes (se houver)
/system script remove [find name="pix-notifier-connect"]
/system script remove [find name="pix-notifier-disconnect"]
/system script remove [find name="pix-verificador"]
/system script remove [find name="pix-heartbeat"]

# 2. Criação dos novos scripts
/system script add name="pix-notifier-connect" source="..."
/system script add name="pix-notifier-disconnect" source="..."
/system script add name="pix-verificador" source="..."
/system script add name="pix-heartbeat" source="..."

# 3. Configuração dos schedulers
/system scheduler remove [find name="pix-verificador-scheduler"]
/system scheduler remove [find name="pix-heartbeat-scheduler"]
/system scheduler add name="pix-verificador-scheduler" interval=30s on-event="/system script run pix-verificador"
/system scheduler add name="pix-heartbeat-scheduler" interval=5m on-event="/system script run pix-heartbeat"

# 4. Teste dos scripts (opcional)
/system script run pix-heartbeat
/system script run pix-verificador
```

## Segurança

- **Validação de Token**: Todos os requests são validados contra o banco de dados
- **MikroTik Ativo**: Apenas MikroTiks com status "Ativo" podem usar o endpoint
- **Logs Detalhados**: Todas as operações são logadas para auditoria

## URLs Configuradas

- **API Principal**: `https://api.lucro.top`
- **API Vendas**: `https://api.mikropix.online` (para recent-sales e heartbeat)

## Tratamento de Erros

O endpoint retorna erros padronizados:

- **400**: Dados inválidos (mikrotik_id ou token faltando)
- **401**: Token inválido
- **403**: MikroTik inativo
- **404**: MikroTik não encontrado
- **500**: Erro interno do servidor

## Logs

Todos os logs são prefixados com `[INSTALL SCRIPTS]` para facilitar o debug:

```
[INSTALL SCRIPTS] Gerando scripts para MikroTik: 78957cd3-7096-4acd-970b-0aa0a768c555
[INSTALL SCRIPTS] Scripts gerados com sucesso para MikroTik: MikroTik Principal
```

## Integração com Frontend

Este endpoint pode ser facilmente integrado ao frontend para:
- Botão "Gerar Scripts" na lista de MikroTiks
- Modal com comandos prontos para copiar
- Download de arquivo .rsc com os comandos
- Instruções passo-a-passo para o usuário 