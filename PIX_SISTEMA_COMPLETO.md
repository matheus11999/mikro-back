# Sistema PIX Completo com Limpeza Automática

## Scripts Criados

### 1. mikrotik-principal-completo.rsc
- Processa vendas da API no formato MAC-MINUTOS
- Cria IP binding com comentário: PIX-EXPIRE-YYYYMMDD-HHMM-MAC
- Notifica API sobre conexão

### 2. mikrotik-limpeza-completa.rsc  
- Identifica bindings PIX pelo comentário
- Remove bindings expirados baseado na data/hora
- Notifica API sobre desconexão

### 3. mikrotik-configurar-schedulers.rsc
- Configura execução automática (vendas: 2min, limpeza: 10min)

### 4. mikrotik-teste-comentarios.rsc
- Testa o sistema completo com bindings de exemplo

## Formato do Comentário

`PIX-EXPIRE-20241221-1430-E2:26:89:13:AD:71`

- PIX-EXPIRE-: Identificador
- 20241221: Data (YYYYMMDD) 
- 1430: Hora (HHMM)
- E2:26:89:13:AD:71: MAC address

## Como Usar

1. Copie os 4 scripts para o Mikrotik
2. Execute o teste: `/system script run mikrotik-teste-comentarios`
3. Configure schedulers: `/system script run mikrotik-configurar-schedulers`

Sistema funcionará automaticamente processando vendas e removendo bindings expirados. 