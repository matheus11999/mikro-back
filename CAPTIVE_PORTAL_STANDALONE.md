# 🚀 Captive Portal Standalone para MikroTik

## 📋 Visão Geral

Este é um **captive portal completo** que funciona **localmente no MikroTik** sem depender de iframes externos. Integra-se totalmente com a API real para:

- ✅ **Login com senha** (username = password)
- ✅ **Listagem de planos** disponíveis
- ✅ **Geração de PIX** com QR Code
- ✅ **Verificação automática** de pagamento
- ✅ **Trial de 10 segundos** após copiar PIX
- ✅ **Interface moderna** e responsiva

## 🔧 Configuração Rápida

### 1. **Edite o arquivo `mikrotik-login-standalone.html`**

Localize a seção de configuração no início do JavaScript:

```javascript
// ==================================================
// CONFIGURAÇÃO IMPORTANTE - ALTERE AQUI!
// ==================================================
const CONFIG = {
    // ALTERE ESTAS VARIÁVEIS PARA SEU AMBIENTE:
    MIKROTIK_ID: '78957cd3-7096-4acd-970b-0aa0a768c555',  // ← COLOQUE SEU MIKROTIK ID AQUI
    API_URL: 'https://api.lucro.top',                     // ← COLOQUE A URL DA SUA API AQUI
    
    // Outras configurações (geralmente não precisa alterar):
    CHECK_INTERVAL: 5000,      // Intervalo de verificação de pagamento (5 segundos)
    PAYMENT_TIMEOUT: 300,      // Timeout do pagamento em segundos (5 minutos)
    TRIAL_DELAY: 10000,        // Delay para ativar trial após copiar PIX (10 segundos)
    DEBUG: false               // Ativar modo debug (true/false)
};
// ==================================================
```

### 2. **Configure no MikroTik**

1. Acesse o MikroTik via WinBox ou WebFig
2. Vá em **IP → Hotspot → Server Profiles**
3. Selecione seu perfil de hotspot
4. Na aba **Login**, cole o conteúdo do arquivo `mikrotik-login-standalone.html`
5. Clique em **OK** para salvar

### 3. **Teste**

Para testar localmente antes de colocar no MikroTik:

```bash
# Inicie o servidor da API
cd backend
npm start

# Acesse no navegador
http://localhost:3000/mikrotik-login-standalone.html?mac=AA:BB:CC:DD:EE:FF&debug=1
```

## 📊 Fluxo Completo

### 1. **Tela de Login**
- Campo único de senha
- Username = Password (automático)
- Botão "Comprar Acesso" para novos usuários

### 2. **Seleção de Planos**
- Busca planos da API em tempo real
- Mostra nome, preço e duração
- Indica senhas disponíveis

### 3. **Instruções**
- Explica o processo de pagamento
- Informa sobre trial de 10 segundos
- Prepara usuário para PIX

### 4. **Pagamento PIX**
- QR Code gerado pela API
- Chave PIX copiável
- Timer de 5 minutos
- Trial ativado após 10 segundos da cópia

### 5. **Sucesso**
- Mostra credenciais
- Login automático em 5 segundos
- Redireciona para internet

## 🔌 Integração com API

### Endpoints Utilizados:

1. **`POST /api/captive-check/planos`**
   - Busca planos disponíveis
   - Parâmetro: `mikrotik_id`

2. **`POST /api/captive-check/pix`**
   - Gera pagamento PIX
   - Parâmetros: `mac`, `mikrotik_id`, `plano_id`, `preco`, `descricao`

3. **`POST /api/captive-check/poll-payment`**
   - Verifica status do pagamento
   - Parâmetro: `payment_id`
   - Polling a cada 5 segundos

## 🎨 Características

### Interface Moderna
- Gradientes e animações suaves
- Design responsivo (mobile-first)
- Feedback visual em todas ações
- Loading states apropriados

### Segurança
- Sem dados mockados
- Validação de todos inputs
- Tratamento de erros robusto
- Timeout de pagamento

### UX Otimizada
- Fluxo intuitivo passo-a-passo
- Mensagens claras de feedback
- Retry automático em falhas
- Debug mode para troubleshooting

## 🐛 Modo Debug

Ative o debug de duas formas:

1. **No código:**
```javascript
DEBUG: true  // Altere para true no CONFIG
```

2. **Na URL:**
```
?debug=1
```

O debug mostra:
- Status atual
- Dados do MikroTik (MAC, IP, etc)
- Configuração da API
- Payment ID
- Timestamps

## 🚨 Troubleshooting

### "Configuração incompleta"
- Verifique se alterou `MIKROTIK_ID` e `API_URL` no código
- Confirme que a API está rodando e acessível

### "MAC address não encontrado"
- O arquivo deve ser servido pelo MikroTik
- Teste com `?mac=AA:BB:CC:DD:EE:FF` para desenvolvimento

### "Erro ao carregar planos"
- Verifique se o `mikrotik_id` existe no banco
- Confirme que há planos cadastrados
- Teste a API diretamente

### "Trial não ativa"
- Trial só funciona quando servido pelo MikroTik
- Requer variáveis `$(link-login-only)` processadas

### Trial não ativa
- Verifique se o MikroTik tem trial habilitado
- Confirme que o MAC address está sendo passado
- Verifique os logs do console do navegador

### Pagamento não é detectado
- Confirme que a API está respondendo
- Verifique o payment_id no console
- Teste o endpoint de poll-payment manualmente

### Erro de CORS
- Configure headers apropriados na API
- Use HTTPS em produção
- Verifique domínios permitidos

## 📦 Arquivo Completo

O arquivo `mikrotik-login-standalone.html` contém:

- ✅ HTML completo
- ✅ CSS inline (sem dependências)
- ✅ JavaScript puro (sem jQuery)
- ✅ Integração completa com API
- ✅ Todas as telas necessárias
- ✅ Lógica de trial e pagamento

## 🎯 Vantagens

1. **Standalone** - Funciona 100% local no MikroTik
2. **Sem iframe** - Evita problemas de CORS e loops
3. **Responsivo** - Funciona em qualquer dispositivo
4. **Confiável** - Tratamento robusto de erros
5. **Moderno** - Interface atual e atraente

## 🚀 Deploy

1. Configure as variáveis no código
2. Copie todo o conteúdo do arquivo
3. Cole no perfil do hotspot MikroTik
4. Salve e teste com um dispositivo

**Pronto! Seu captive portal está funcionando com integração total à API!** 🎉

## Melhorias Implementadas (Última Atualização)

### 1. **Gerenciamento de Pagamentos Existentes**
- Verifica se já existe um pagamento pendente antes de criar novo
- Reutiliza pagamentos válidos (menos de 10 minutos)
- Deleta automaticamente pagamentos expirados do banco de dados
- Evita duplicação de cobranças

### 2. **Sistema de Trial Aprimorado**
- Ativação em 10 segundos após copiar PIX
- Username formato: `T-{MAC}` (ex: T-AA-BB-CC-DD-EE-FF)
- Redirecionamento direto para URL do MikroTik
- Fallback inteligente se link não disponível
- Mensagem de confirmação antes do redirecionamento

### 3. **Verificação de Pagamento**
- **Processamento no servidor**: A verificação é feita pela API no backend
- Polling a cada 5 segundos via endpoint `/api/captive-check/poll-payment`
- Backend consulta Mercado Pago e processa aprovações automaticamente
- Atualização de saldos e entrega de senha automática

### 4. **Melhorias no Formulário**
- Input único para senha (username = password)
- Suporte para tecla Enter
- Focus automático no campo de senha
- Formulário compatível com CHAP authentication

### 5. **Fluxo de Pagamento Otimizado**
```
1. Usuário tenta login → Falha → Oferece compra
2. Seleciona plano → Vê instruções
3. Gera/recupera PIX → Copia chave
4. Aguarda 10 segundos → Trial ativado
5. Backend verifica pagamento → Aprova automaticamente
6. Credenciais entregues → Login automático
```

### 6. **Segurança e Performance**
- Pagamentos expirados são deletados automaticamente
- Prevenção de duplicação de pagamentos
- Validação robusta de parâmetros
- Tratamento de erros em todos os níveis

### 7. **Compatibilidade MikroTik**
- Funciona com qualquer versão do RouterOS
- Suporta trial nativo do MikroTik
- Compatível com CHAP e PAP authentication
- Redirecionamento automático após pagamento 