# 📚 Documentação Técnica da API - PIX Mikro CRM

## 🎯 Introdução

Esta documentação técnica fornece informações completas sobre a API do PIX Mikro CRM, incluindo todos os endpoints para captive portal, gerenciamento de vendas, integração com Mercado Pago e monitoramento em tempo real.

**Versão:** 2.0  
**Base URL:** `http://localhost:3000/api/captive-check`  
**Protocolo:** HTTP/HTTPS  
**Formato de Dados:** JSON  
**Última Atualização:** 2025-01-21

## 📖 Índice de Referência

- [🔧 Configuração e Setup](#configuração-e-setup)
- [🔐 Autenticação](#autenticação)
- [📋 Endpoints Detalhados](#endpoints-detalhados)
- [💾 Modelos de Dados](#modelos-de-dados)
- [💻 Exemplos Práticos](#exemplos-práticos)
- [🐛 Troubleshooting](#troubleshooting)
- [📊 Monitoramento](#monitoramento)
- [🔄 Integração com Webhook](#integração-com-webhook)
- [🔒 Segurança](#segurança)

## 🔧 Configuração e Setup

### Instalação Rápida

```bash
# Clone o repositório
git clone https://github.com/matheus11999/mikro-back.git
cd backend

# Instale dependências
npm install

# Configure variáveis de ambiente
cp .env.example .env
```

### Variáveis de Ambiente Obrigatórias

```env
# Banco de Dados Supabase
SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Gateway de Pagamento Mercado Pago
MERCADO_PAGO_ACCESS_TOKEN=APP_USR-xxxxxxxxxx-xxxxxx-xxxx-xxxx-xxxxxxxxxxxx

# Configurações do Servidor
PORT=3000
NODE_ENV=production
APP_MODE=backend

# Configurações Opcionais
WEBHOOK_SECRET=seu_webhook_secret
CORS_ORIGIN=*
MAX_REQUESTS_PER_MINUTE=60
FRONTEND_BUILD_PATH=./dist
FRONTEND_PORT=5173
```

### Comandos de Execução

```bash
# Desenvolvimento
npm run dev

# Produção
npm start

# Debug detalhado
DEBUG=api:* npm start

# Teste da API
npm test
```

## 🔐 Autenticação

**Nota:** Esta API não utiliza autenticação tradicional. A validação é baseada em:
- **MAC Address:** Identificação única do dispositivo
- **Mikrotik ID:** Identificação do ponto de acesso
- **Payment ID:** Identificação do pagamento no Mercado Pago

### Headers Recomendados

```javascript
{
  'Content-Type': 'application/json',
  'User-Agent': 'PIXMikro/2.0',
  'X-Request-ID': 'uuid-único-para-logs',
  'Accept': 'application/json'
}
```

## 📋 Endpoints Detalhados

### 1. 🏥 Health Check

**Finalidade:** Verificar se a API está operacional e acessível.

```http
GET /api/captive-check
```

**Resposta de Sucesso (200):**
```json
{
  "status": "ok",
  "message": "API está funcionando!",
  "timestamp": "2025-01-21T15:30:00.000Z",
  "version": "2.0.0"
}
```

**Exemplo cURL:**
```bash
curl -X GET http://localhost:3000/api/captive-check
```

---

### 2. 📱 Listar Planos Disponíveis

**Finalidade:** Obter todos os planos disponíveis para um Mikrotik específico.

```http
POST /api/captive-check/planos
```

**Parâmetros Obrigatórios:**
```json
{
  "mikrotik_id": "uuid"  // ID do Mikrotik no sistema
}
```

**Resposta de Sucesso (200):**
```json
{
  "planos": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "nome": "Plano 1 Hora - 5MB",
      "preco": 5.00,
      "duracao": 60,
      "mikrotik_id": "550e8400-e29b-41d4-a716-446655440000",
      "criado_em": "2025-01-20T10:00:00.000Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "nome": "Plano 2 Horas - 10MB",
      "preco": 8.00,
      "duracao": 120,
      "mikrotik_id": "550e8400-e29b-41d4-a716-446655440000",
      "criado_em": "2025-01-20T10:00:00.000Z"
    }
  ],
  "mikrotik_id": "550e8400-e29b-41d4-a716-446655440000",
  "total": 2
}
```

**Resposta Sem Planos (404):**
```json
{
  "error": "Nenhum plano encontrado para este Mikrotik",
  "code": "NO_PLANS_FOUND",
  "mikrotik_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Exemplo JavaScript:**
```javascript
async function buscarPlanos(mikrotikId) {
  try {
    const response = await fetch('http://localhost:3000/api/captive-check/planos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mikrotik_id: mikrotikId
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('Planos disponíveis:', data.planos);
      return data.planos;
    } else {
      console.error('Erro:', data.error);
      return [];
    }
  } catch (error) {
    console.error('Erro na requisição:', error);
    return [];
  }
}
```

---

### 3. 🔍 Verificar Status do MAC

**Finalidade:** Verificar o status atual de um dispositivo e possíveis pagamentos pendentes.

```http
POST /api/captive-check/status
```

**Parâmetros Obrigatórios:**
```json
{
  "mac": "string",      // MAC Address formato AA:BB:CC:DD:EE:FF
  "mikrotik_id": "uuid" // ID do Mikrotik no sistema
}
```

**Possíveis Respostas:**

#### 🆕 Primeira Vez / Precisa Comprar (200)
```json
{
  "status": "precisa_comprar",
  "mac": "AA:BB:CC:DD:EE:FF",
  "mikrotik_id": "550e8400-e29b-41d4-a716-446655440000",
  "total_vendas": 0,
  "total_gasto": 0.00,
  "ultimo_valor": null,
  "ultimo_plano": null,
  "disponivel": true
}
```

#### ⏳ Pagamento Pendente (200)
```json
{
  "status": "pendente",
  "mac": "AA:BB:CC:DD:EE:FF",
  "mikrotik_id": "550e8400-e29b-41d4-a716-446655440000",
  "total_vendas": 0,
  "total_gasto": 0.00,
  "ultimo_valor": 5.00,
  "ultimo_plano": null,
  "pagamento_pendente": {
    "status": "pending",
    "pagamento_gerado_em": "2025-01-21T15:25:00.000Z",
    "chave_pix": "00020126580014br.gov.bcb.pix0136...",
    "qrcode": "iVBORw0KGgoAAAANSUhEUgAAASwAAAEsAQMAAA...",
    "valor": 5.00,
    "ticket_url": "115712162800",
    "payment_id": "115712162800",
    "expira_em": "2025-01-21T15:35:00.000Z"
  }
}
```

#### ✅ Autenticado / Com Acesso (200)
```json
{
  "status": "autenticado",
  "mac": "AA:BB:CC:DD:EE:FF",
  "mikrotik_id": "550e8400-e29b-41d4-a716-446655440000",
  "total_vendas": 1,
  "total_gasto": 5.00,
  "ultimo_valor": 5.00,
  "ultimo_plano": "Plano 1 Hora - 5MB",
  "username": "user_12345",
  "password": "pass_67890",
  "plano": "Plano 1 Hora - 5MB",
  "duracao": 60,
  "fim": "2025-01-21T16:30:00.000Z",
  "tempo_restante": 3420
}
```

---

### 4. 💳 Gerar PIX para Pagamento

**Finalidade:** Gerar uma nova cobrança PIX via Mercado Pago para um plano específico.

```http
POST /api/captive-check/pix
```

**Parâmetros Obrigatórios:**
```json
{
  "mac": "string",      // MAC Address formato AA:BB:CC:DD:EE:FF
  "mikrotik_id": "uuid", // ID do Mikrotik
  "plano_id": "uuid"    // ID do plano escolhido
}
```

**Resposta de Sucesso (200):**
```json
{
  "status": "pix_gerado",
  "payment_id": "115712162800",
  "qr_code": "iVBORw0KGgoAAAANSUhEUgAAASwAAAEsAQMAAA...",
  "qr_code_base64": "data:image/png;base64,iVBORw0KGgoAAAA...",
  "ticket_url": "115712162800",
  "expires_at": "2025-01-21T15:40:00.000Z",
  "point_of_interaction": {
    "transaction_data": {
      "qr_code": "00020126580014br.gov.bcb.pix0136..."
    }
  },
  "valor": 5.00,
  "descricao": "Plano 1 Hora - 5MB",
  "plano": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "nome": "Plano 1 Hora - 5MB",
    "preco": 5.00,
    "duracao": 60
  }
}
```

**Resposta de Erro (400):**
```json
{
  "error": "Já existe um pagamento pendente para este MAC",
  "code": "PAYMENT_PENDING",
  "details": "Aguarde o pagamento atual ou tente novamente após 10 minutos"
}
```

---

### 5. ✅ Verificar Status do Pagamento

**Finalidade:** Verificar e processar o status de um pagamento existente.

```http
POST /api/captive-check/verify
```

**Parâmetros Obrigatórios:**
```json
{
  "mac": "string",      // MAC Address
  "mikrotik_id": "uuid", // ID do Mikrotik
  "plano_id": "uuid"    // ID do plano
}
```

**Resposta - Pagamento Aprovado (200):**
```json
{
  "mac": "AA:BB:CC:DD:EE:FF",
  "mikrotik_id": "550e8400-e29b-41d4-a716-446655440000",
  "total_vendas": 1,
  "total_gasto": 5.00,
  "ultimo_valor": 5.00,
  "ultimo_plano": "550e8400-e29b-41d4-a716-446655440001",
  "status": "approved",
  "pagamento_pendente": {
    "status": "approved",
    "pagamento_gerado_em": "2025-01-21T15:25:00.000Z",
    "pagamento_aprovado_em": "2025-01-21T15:28:00.000Z",
    "chave_pix": "00020126580014br.gov.bcb.pix0136...",
    "qrcode": "iVBORw0KGgoAAAANSUhEUgAAASwAAAEsAQMAAA...",
    "valor": 5.00,
    "ticket_url": "115712162800",
    "payment_id": "115712162800",
    "senha": {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "usuario": "user_12345",
      "senha": "pass_67890"
    }
  },
  "username": "user_12345",
  "password": "pass_67890",
  "plano": "550e8400-e29b-41d4-a716-446655440001",
  "duracao": 60,
  "fim": "2025-01-21T16:28:00.000Z"
}
```

---

### 6. 🔄 Polling de Pagamento (Método Alternativo)

**Finalidade:** Verificar continuamente o status de um pagamento específico.

```http
POST /api/captive-check/poll-payment
```

**Parâmetros Obrigatórios:**
```json
{
  "payment_id": "string" // ID do pagamento no Mercado Pago
}
```

**Resposta - Pagamento Aprovado (200):**
```json
{
  "status": "approved",
  "payment_status": "approved",
  "username": "user_12345",
  "password": "pass_67890",
  "plano": "Plano 1 Hora - 5MB",
  "duracao": 60,
  "message": "Pagamento aprovado e processado com sucesso"
}
```

**Resposta - Pagamento Pendente (200):**
```json
{
  "status": "pending",
  "payment_status": "pending",
  "status_detail": "pending_waiting_payment",
  "message": "Pagamento ainda não foi aprovado"
}
```

---

### 7. ⏰ Vendas Recentes (Últimos 10 minutos) - NOVO!

**Finalidade:** Listar vendas aprovadas nos últimos 10 minutos para um Mikrotik específico.

```http
GET /api/recent-sales/{mikrotik_id}
```

**Parâmetros de Rota:**
- `mikrotik_id`: UUID do Mikrotik

**Resposta de Sucesso (200):**
```
Texto plano no formato: usuario-senha-mac-minutos
user_001-pass_001-AA:BB:CC:DD:EE:FF-60
user_002-pass_002-11:22:33:44:55:66-120
user_003-pass_003-77:88:99:AA:BB:CC-30
```

**Resposta Sem Vendas (200):**
```
(resposta vazia)
```

**Exemplo JavaScript:**
```javascript
async function obterVendasRecentes(mikrotikId) {
  try {
    const response = await fetch(`http://localhost:3000/api/recent-sales/${mikrotikId}`);
    const data = await response.text();

    if (response.ok) {
      if (data.trim() === '') {
        console.log('Nenhuma venda encontrada nos últimos 10 minutos');
        return [];
      }
      
      const vendas = data.trim().split('\n');
      console.log(`Encontradas ${vendas.length} vendas nos últimos 10 minutos:`);
      
      return vendas.map((venda, index) => {
        const [usuario, senha, mac, minutos] = venda.split('-');
        return { usuario, senha, mac, minutos: parseInt(minutos) };
      });
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
    } catch (error) {
    console.error('Erro na requisição:', error);
    return [];
  }
}

// Exemplo de uso
const vendas = await obterVendasRecentes('550e8400-e29b-41d4-a716-446655440000');
vendas.forEach((venda, index) => {
  console.log(`${index + 1}. Usuario: ${venda.usuario}, MAC: ${venda.mac}, Duração: ${venda.minutos}min`);
});
```

**Casos de Uso:**
- ✅ Monitoramento de vendas em tempo real
- ✅ Integração com sistemas Mikrotik para entrega automática
- ✅ Alertas de vendas recentes
- ✅ Dashboard de atividade em tempo real
- ✅ Sincronização com RouterOS

---

## 💾 Modelos de Dados

### 📋 Estrutura do MAC
```json
{
  "id": "uuid",
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "mikrotik_id": "uuid",
  "primeiro_acesso": "2025-01-21T15:00:00.000Z",
  "ultimo_acesso": "2025-01-21T15:30:00.000Z",
  "total_compras": 1,
  "ultimo_plano": "Plano 1 Hora - 5MB",
  "ultimo_valor": 5.00,
  "total_gasto": 5.00,
  "status": "coletado",
  "status_pagamento": "aprovado",
  "chave_pix": "00020126580014br.gov.bcb.pix0136...",
  "qrcode": "iVBORw0KGgoAAAANSUhEUgAAASwAAAEsAQMAAA...",
  "pagamento_aprovado_em": "2025-01-21T15:28:00.000Z"
}
```

### 💰 Estrutura da Venda
```json
{
  "id": "uuid",
  "cliente_id": "uuid",
  "mikrotik_id": "uuid",
  "plano_id": "uuid",
  "senha_id": "uuid",
  "mac_id": "uuid",
  "valor": 3.50,
  "lucro": 1.50,
  "preco": 5.00,
  "status": "aprovado",
  "data": "2025-01-21T15:28:00.000Z",
  "descricao": "Plano 1 Hora - 5MB",
  "chave_pix": "00020126580014br.gov.bcb.pix0136...",
  "qrcode": "iVBORw0KGgoAAAANSUhEUgAAASwAAAEsAQMAAA...",
  "payment_id": "115712162800",
  "pagamento_aprovado_em": "2025-01-21T15:28:00.000Z",
  "pagamento_gerado_em": "2025-01-21T15:25:00.000Z",
  "ticket_url": "115712162800"
}
```

### 🎯 Estrutura do Plano
```json
{
  "id": "uuid",
  "nome": "Plano 1 Hora - 5MB",
  "preco": 5.00,
  "mikrotik_id": "uuid",
  "criado_em": "2025-01-21T10:00:00.000Z",
  "duracao": 60
}
```

### 🔑 Estrutura da Senha
```json
{
  "id": "uuid",
  "plano_id": "uuid",
  "disponivel": true,
  "vendida": false,
  "criada_em": "2025-01-21T10:00:00.000Z",
  "usuario": "user_12345",
  "senha": "pass_67890",
  "vendida_em": null
}
```

---

## 💻 Exemplos Práticos

### 🔄 Fluxo Completo de Captive Portal

```javascript
class CaptivePortalAPI {
  constructor(baseUrl = 'http://localhost:3000/api/captive-check') {
    this.baseUrl = baseUrl;
  }

  async verificarStatus(mac, mikrotikId) {
    const response = await fetch(`${this.baseUrl}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac, mikrotik_id: mikrotikId })
      });
    return response.json();
  }

  async buscarPlanos(mikrotikId) {
    const response = await fetch(`${this.baseUrl}/planos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mikrotik_id: mikrotikId })
    });
    return response.json();
  }

  async gerarPix(mac, mikrotikId, planoId) {
    const response = await fetch(`${this.baseUrl}/pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac, mikrotik_id: mikrotikId, plano_id: planoId })
    });
    return response.json();
  }

  async verificarPagamento(mac, mikrotikId, planoId) {
    const response = await fetch(`${this.baseUrl}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac, mikrotik_id: mikrotikId, plano_id: planoId })
    });
    return response.json();
  }

  async obterVendasRecentes(mikrotikId) {
    const response = await fetch(`${this.baseUrl.replace('/captive-check', '')}/recent-sales/${mikrotikId}`);
    const text = await response.text();
    
    if (!text.trim()) return [];
    
    return text.trim().split('\n').map(linha => {
      const [usuario, senha, mac, minutos] = linha.split('-');
      return { usuario, senha, mac, minutos: parseInt(minutos) };
    });
  }

  // Fluxo completo automatizado
  async fluxoCompleto(mac, mikrotikId) {
    try {
      // 1. Verificar status inicial
      const status = await this.verificarStatus(mac, mikrotikId);
      console.log('Status inicial:', status.status);

      if (status.status === 'autenticado') {
        return {
          sucesso: true,
          usuario: status.username,
          senha: status.password,
          tempo_restante: status.tempo_restante
        };
      }

      if (status.status === 'pendente') {
        console.log('Pagamento pendente encontrado, verificando...');
        // Verificar se foi aprovado
        const verificacao = await this.verificarPagamento(mac, mikrotikId, status.pagamento_pendente.plano_id);
        
        if (verificacao.status === 'approved') {
          return {
            sucesso: true,
            usuario: verificacao.username,
            senha: verificacao.password
          };
        } else {
          return {
            sucesso: false,
            motivo: 'pagamento_pendente',
            pagamento: status.pagamento_pendente
          };
        }
      }

      // 2. Buscar planos disponíveis
      const planosResponse = await this.buscarPlanos(mikrotikId);
      if (!planosResponse.planos || planosResponse.planos.length === 0) {
        throw new Error('Nenhum plano disponível');
      }

      // 3. Selecionar primeiro plano (ou deixar usuário escolher)
      const plano = planosResponse.planos[0];
      console.log('Plano selecionado:', plano.nome, '- R$', plano.preco);

      // 4. Gerar PIX
      const pix = await this.gerarPix(mac, mikrotikId, plano.id);
      console.log('PIX gerado:', pix.payment_id);

  return {
        sucesso: false,
        motivo: 'pix_gerado',
        pix: pix,
        plano: plano
      };

    } catch (error) {
      console.error('Erro no fluxo:', error);
      return {
        sucesso: false,
        motivo: 'erro',
        erro: error.message
      };
    }
  }
}

// Exemplo de uso
const api = new CaptivePortalAPI();
const resultado = await api.fluxoCompleto('AA:BB:CC:DD:EE:FF', '550e8400-e29b-41d4-a716-446655440000');

if (resultado.sucesso) {
  console.log('✅ Acesso liberado!');
  console.log('Usuário:', resultado.usuario);
  console.log('Senha:', resultado.senha);
} else if (resultado.motivo === 'pix_gerado') {
  console.log('💳 PIX gerado, aguardando pagamento...');
  console.log('QR Code:', resultado.pix.qr_code_base64);
} else if (resultado.motivo === 'pagamento_pendente') {
  console.log('⏳ Pagamento pendente, aguardando confirmação...');
}
```

### 🔍 Monitor de Vendas em Tempo Real

```javascript
class VendasMonitor {
  constructor(mikrotikId, intervalo = 30000) {
    this.mikrotikId = mikrotikId;
    this.intervalo = intervalo;
    this.ultimasVendas = [];
    this.callbacks = [];
  }

  onNovaVenda(callback) {
    this.callbacks.push(callback);
  }

  async iniciarMonitoramento() {
    console.log(`🎯 Iniciando monitoramento de vendas para Mikrotik: ${this.mikrotikId}`);
    
    setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:3000/api/recent-sales/${this.mikrotikId}`);
        const text = await response.text();
        
        if (!text.trim()) return;
        
        const vendas = text.trim().split('\n').map(linha => {
          const [usuario, senha, mac, minutos] = linha.split('-');
          return { usuario, senha, mac, minutos: parseInt(minutos), timestamp: Date.now() };
        });

        // Verificar novas vendas
        const novasVendas = vendas.filter(venda => 
          !this.ultimasVendas.some(antiga => 
            antiga.usuario === venda.usuario && antiga.mac === venda.mac
          )
        );

        if (novasVendas.length > 0) {
          console.log(`🎉 ${novasVendas.length} nova(s) venda(s) detectada(s)!`);
          
          novasVendas.forEach(venda => {
            this.callbacks.forEach(callback => callback(venda));
          });
        }

        this.ultimasVendas = vendas;

      } catch (error) {
        console.error('❌ Erro no monitoramento:', error);
      }
    }, this.intervalo);
  }
}

// Exemplo de uso do monitor
const monitor = new VendasMonitor('550e8400-e29b-41d4-a716-446655440000', 10000);

monitor.onNovaVenda((venda) => {
  console.log('🎉 Nova venda detectada!');
  console.log(`📱 MAC: ${venda.mac}`);
  console.log(`👤 Usuário: ${venda.usuario}`);
  console.log(`🔑 Senha: ${venda.senha}`);
  console.log(`⏱️ Duração: ${venda.minutos} minutos`);
  
  // Enviar para Mikrotik ou outro sistema
  enviarParaMikrotik(venda);
});

monitor.iniciarMonitoramento();

async function enviarParaMikrotik(venda) {
  try {
    // Exemplo de integração com Mikrotik via webhook
    const dados = `${venda.usuario}:${venda.senha}:${venda.mac}:${venda.minutos}`;
    
    const response = await fetch('http://mikrotik-webhook-url.com/adduser', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: dados
    });

    if (response.ok) {
      console.log('✅ Venda enviada para o Mikrotik com sucesso');
    } else {
      console.error('❌ Erro ao enviar para o Mikrotik:', response.status);
    }
  } catch (error) {
    console.error('❌ Erro na integração com Mikrotik:', error);
  }
}
```

---

## 🐛 Troubleshooting

### Problemas Comuns

#### 1. **Erro 400 - Parâmetros obrigatórios**
```json
{
  "error": "mac, mikrotik_id obrigatórios",
  "code": "VALIDATION_ERROR"
}
```
**Solução:** Verifique se todos os parâmetros obrigatórios estão sendo enviados corretamente.

#### 2. **Erro 404 - Planos não encontrados**
```json
{
  "error": "Nenhum plano encontrado para este Mikrotik",
  "code": "NO_PLANS_FOUND"
}
```
**Solução:** Verifique se o Mikrotik ID está correto e se há planos cadastrados.

#### 3. **Erro 500 - Erro do Mercado Pago**
```json
{
  "error": "Erro ao processar requisição no Mercado Pago",
  "code": "MERCADOPAGO_ERROR"
}
```
**Solução:** Verifique as credenciais do Mercado Pago e se o serviço está operacional.

#### 4. **PIX Expirado**
**Problema:** PIX gerado há mais de 10 minutos não funciona.  
**Solução:** Gere um novo PIX. O sistema automaticamente expira PIXs antigos.

#### 5. **Vendas não aparecem no endpoint recent-sales**
**Problema:** Vendas aprovadas não aparecem no monitoramento.  
**Solução:** Verifique se as vendas foram aprovadas nos últimos 10 minutos e se o Mikrotik ID está correto.

### Testes de Conectividade

```bash
# Testar API
curl -X GET http://localhost:3000/api/captive-check

# Testar planos
curl -X POST http://localhost:3000/api/captive-check/planos \
  -H "Content-Type: application/json" \
  -d '{"mikrotik_id": "550e8400-e29b-41d4-a716-446655440000"}'

# Testar vendas recentes
curl -X GET http://localhost:3000/api/recent-sales/550e8400-e29b-41d4-a716-446655440000

# Testar status do MAC
curl -X POST http://localhost:3000/api/captive-check/status \
  -H "Content-Type: application/json" \
  -d '{"mac": "AA:BB:CC:DD:EE:FF", "mikrotik_id": "550e8400-e29b-41d4-a716-446655440000"}'
```

---

## 📊 Monitoramento

### Métricas Importantes

1. **Vendas por Minuto:** Monitore via `/api/recent-sales/{mikrotik_id}`
2. **Taxa de Conversão:** Status → PIX Gerado → Pagamento Aprovado
3. **Tempo de Resposta:** Latência dos endpoints críticos
4. **Erros do Mercado Pago:** Falhas na geração de PIX
5. **Expiração de PIX:** Quantos PIXs expiram sem pagamento

### Dashboard Simples

```javascript
class APIMonitor {
  async gerarRelatorio(mikrotikId) {
    const inicio = Date.now();
    
    try {
      // Testar health check
      const healthResponse = await fetch('http://localhost:3000/api/captive-check');
      const healthTime = Date.now() - inicio;
      
      // Buscar vendas recentes
      const vendasResponse = await fetch(`http://localhost:3000/api/recent-sales/${mikrotikId}`);
      const vendas = await vendasResponse.text();
      const totalVendas = vendas.trim() ? vendas.trim().split('\n').length : 0;
      
      return {
        status: 'online',
        latencia: healthTime,
        vendas_10min: totalVendas,
        timestamp: new Date().toISOString()
      };
  } catch (error) {
      return {
        status: 'offline',
        erro: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Usar a cada minuto
const monitor = new APIMonitor();
setInterval(async () => {
  const relatorio = await monitor.gerarRelatorio('550e8400-e29b-41d4-a716-446655440000');
  console.log('📊 Relatório da API:', relatorio);
}, 60000);
```

---

## 🔄 Integração com Webhook

### Configuração do Webhook no Mercado Pago

```javascript
// URL para configurar no painel do Mercado Pago:
// https://seu-dominio.com/webhook/mercadopago

app.post('/webhook/mercadopago', async (req, res) => {
  try {
    const notification = req.body;
    console.log('[WEBHOOK] Recebido:', notification);

    if (notification.type === 'payment') {
      const paymentId = notification.data.id;
      await processPaymentNotification(paymentId);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[WEBHOOK] Erro:', error);
    res.status(500).send('Internal Server Error');
  }
});
```

### Verificação de Assinatura (Recomendado)

```javascript
const crypto = require('crypto');

function verificarAssinatura(body, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  
  return hash === signature;
}

app.post('/webhook/mercadopago', (req, res) => {
  const signature = req.headers['x-signature'];
  const body = JSON.stringify(req.body);
  
  if (!verificarAssinatura(body, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Unauthorized');
  }
  
  // Processar webhook...
});
```

---

## 🔒 Segurança

### Recomendações de Segurança

1. **HTTPS em Produção:** Sempre usar HTTPS para proteger dados sensíveis
2. **Rate Limiting:** Implementar limitação de requisições por IP
3. **Validação de Entrada:** Sempre validar todos os parâmetros
4. **Logs Seguros:** Não loggar senhas ou tokens em texto plano
5. **Webhook Signature:** Verificar assinatura dos webhooks do Mercado Pago
6. **CORS Restritivo:** Configurar CORS apenas para domínios autorizados

### Implementação de Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

// Rate limiting para geração de PIX
const pixRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 3, // máximo 3 tentativas por minuto por IP
  message: {
    error: 'Muitas tentativas de geração de PIX. Tente novamente em 1 minuto.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

// Rate limiting geral
const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requisições por IP
  message: {
    error: 'Muitas requisições. Tente novamente mais tarde.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

app.use('/api/', generalRateLimit);
app.post('/api/captive-check/pix', pixRateLimit, async (req, res) => {
  // Lógica do endpoint...
});
```

---

## 📞 Suporte Técnico

Para dúvidas ou problemas com a API:

1. **Consulte esta documentação**
2. **Verifique os logs da aplicação**
3. **Teste endpoints individualmente**
4. **Confirme configurações de ambiente**
5. **Use o arquivo de teste:** `test-recent-sales.html`

## 🔗 Links Úteis

- [📖 Documentação Mercado Pago](https://www.mercadopago.com.br/developers)
- [📖 Documentação Supabase](https://supabase.com/docs)
- [💻 Repositório Backend](https://github.com/matheus11999/mikro-back)
- [🖥️ Repositório Frontend](https://github.com/matheus11999/mikro-front)
- [🏥 Status da API](http://localhost:3000/api/captive-check)
- [🧪 Teste Vendas Recentes](./test-recent-sales.html)

---

## 📋 Changelog

### 🚀 Versão 2.0 (2025-01-21)
- ✅ **NOVO:** Endpoint `/recent-sales/{mikrotik_id}` para vendas dos últimos 10 minutos
- ❌ **REMOVIDO:** Endpoint `/daily-sales/{mikrotik_id}` (substituído)
- ✅ Melhorada documentação com exemplos práticos completos
- ✅ Adicionados modelos de dados detalhados
- ✅ Incluídos exemplos de monitoramento e integração em tempo real
- ✅ Expandida seção de troubleshooting com soluções específicas
- ✅ Melhoradas recomendações de segurança e rate limiting
- ✅ Adicionado arquivo de teste `test-recent-sales.html`

### Versão 1.0 (2025-01-20)
- ✅ Documentação inicial da API
- ✅ Endpoints básicos do captive portal
- ✅ Integração com Mercado Pago
- ✅ Webhook de notificações

---

*Documentação gerada automaticamente • Versão 2.0 • Última atualização: 2025-01-21* 