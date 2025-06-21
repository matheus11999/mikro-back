# 📚 Documentação Técnica da API - Captive Portal PIX

## 🎯 Introdução

Esta documentação técnica fornece informações detalhadas sobre a API de Captive Portal com PIX, incluindo todos os endpoints, estruturas de dados, exemplos práticos e guias de implementação.

**Versão:** 1.0  
**Base URL:** `http://localhost:3000/api/captive-check`  
**Protocolo:** HTTP/HTTPS  
**Formato de Dados:** JSON  

## 📖 Índice de Referência

- [🔧 Configuração e Setup](#configuração-e-setup)
- [🔐 Autenticação](#autenticação)
- [📋 Endpoints Detalhados](#endpoints-detalhados)
- [💾 Modelos de Dados](#modelos-de-dados)
- [💻 Exemplos Práticos](#exemplos-práticos)
- [🐛 Troubleshooting](#troubleshooting)
- [📊 Monitoramento](#monitoramento)
- [🔄 Integração com Webhook](#integração-com-webhook)

## 🔧 Configuração e Setup

### Instalação Rápida

```bash
# Clone o repositório
git clone <repo-url>
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
- MAC Address (identificação única do dispositivo)
- Mikrotik ID (identificação do ponto de acesso)
- Payment ID (identificação do pagamento no Mercado Pago)

### Headers Recomendados

```javascript
{
  'Content-Type': 'application/json',
  'User-Agent': 'CaptivePortal/1.0',
  'X-Request-ID': 'uuid-único-para-logs'
}
```

## 📋 Endpoints Detalhados

### 1. 🏥 Health Check

**Finalidade:** Verificar se a API está operacional e acessível.

```http
GET /
```

**Resposta de Sucesso (200):**
```json
{
  "status": "ok",
  "message": "API está funcionando!",
  "timestamp": "2025-01-20T15:30:00.000Z",
  "version": "1.0.0",
  "uptime": 3600
}
```

**Exemplo cURL:**
```bash
curl -X GET http://localhost:3000/api/captive-check/
```

---

### 2. 📱 Verificação de Status do MAC

**Finalidade:** Verificar o status atual de um dispositivo e possíveis pagamentos pendentes.

```http
POST /status
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
    "pagamento_gerado_em": "2025-01-20T15:25:00.000Z",
    "chave_pix": "00020126580014br.gov.bcb.pix0136...",
    "qrcode": "iVBORw0KGgoAAAANSUhEUgAAASwAAAEsAQMAAA...",
    "valor": 5.00,
    "ticket_url": "115712162800",
    "payment_id": "115712162800",
    "expira_em": "2025-01-20T15:35:00.000Z"
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
  "fim": "2025-01-20T16:30:00.000Z",
  "tempo_restante": 3420
}
```

**Exemplo de Implementação:**
```javascript
async function verificarStatusMac(mac, mikrotikId) {
  try {
    const response = await fetch('http://localhost:3000/api/captive-check/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': generateUUID()
      },
      body: JSON.stringify({
        mac: mac,
        mikrotik_id: mikrotikId
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Erro ao verificar status:', error);
    throw error;
  }
}
```

---

### 3. 💳 Geração de PIX

**Finalidade:** Criar um novo pagamento PIX para liberação de acesso à internet.

```http
POST /pix
```

**Parâmetros Obrigatórios:**
```json
{
  "mac": "string",        // MAC Address do dispositivo
  "plano_id": "uuid",     // ID do plano escolhido
  "mikrotik_id": "uuid",  // ID do Mikrotik
  "preco": "number",      // Valor do pagamento
  "descricao": "string"   // Descrição do pagamento
}
```

**Resposta de Sucesso (201):**
```json
{
  "id": 115712162800,
  "status": "pending",
  "date_created": "2025-01-20T15:30:00.000Z",
  "date_of_expiration": "2025-01-21T15:30:00.000Z",
  "transaction_amount": 5.00,
  "currency_id": "BRL",
  "description": "Acesso WiFi 1 hora - 5MB",
  "payment_method_id": "pix",
  "point_of_interaction": {
    "transaction_data": {
      "qr_code": "00020126580014br.gov.bcb.pix0136...",
      "qr_code_base64": "iVBORw0KGgoAAAANSUhEUgAAASwAAAEsAQMAAA...",
      "ticket_url": "https://www.mercadopago.com.br/px/115712162800"
    }
  },
  "chave_pix": "00020126580014br.gov.bcb.pix0136...",
  "qrcode": "iVBORw0KGgoAAAANSUhEUgAAASwAAAEsAQMAAA...",
  "ticket_url": "115712162800"
}
```

**Possíveis Erros:**

#### Conflito - Pagamento Já Existe (409)
```json
{
  "error": "Já existe um pagamento pendente para este MAC",
  "code": "PAYMENT_ALREADY_EXISTS",
  "details": {
    "existing_payment_id": "115712162799",
    "created_at": "2025-01-20T15:25:00.000Z"
  }
}
```

#### Plano Inválido (400)
```json
{
  "error": "Plano não encontrado ou inativo",
  "code": "INVALID_PLAN",
  "details": {
    "plano_id": "invalid-uuid",
    "mikrotik_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Exemplo de Implementação:**
```javascript
async function gerarPagamentoPix(dadosPagamento) {
  try {
    const response = await fetch('http://localhost:3000/api/captive-check/pix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': generateUUID()
      },
      body: JSON.stringify(dadosPagamento)
    });

    if (response.status === 409) {
      const error = await response.json();
      throw new Error(`Pagamento já existe: ${error.details.existing_payment_id}`);
    }

    if (!response.ok) {
      throw new Error(`Erro ao gerar PIX: ${response.status}`);
    }

    const pixData = await response.json();
    
    // Salvar dados do PIX localmente se necessário
    localStorage.setItem('current_payment', JSON.stringify(pixData));
    
    return pixData;
  } catch (error) {
    console.error('Erro na geração do PIX:', error);
    throw error;
  }
}

// Exemplo de uso
const dadosPagamento = {
  mac: 'AA:BB:CC:DD:EE:FF',
  plano_id: '550e8400-e29b-41d4-a716-446655440001',
  mikrotik_id: '550e8400-e29b-41d4-a716-446655440000',
  preco: 5.00,
  descricao: 'Acesso WiFi 1 hora'
};

gerarPagamentoPix(dadosPagamento)
  .then(pixData => {
    console.log('PIX gerado:', pixData.id);
    exibirQRCode(pixData.qrcode);
    iniciarPollingPagamento(pixData.id);
  })
  .catch(error => {
    console.error('Falha:', error.message);
  });
```

---

### 4. 🔍 Verificação de Pagamento

**Finalidade:** Verificar status de um pagamento específico usando dados da venda.

```http
POST /verify
```

**Parâmetros Obrigatórios:**
```json
{
  "mac": "string",        // MAC Address
  "mikrotik_id": "uuid",  // ID do Mikrotik
  "plano_id": "uuid"      // ID do plano (opcional)
}
```

**Resposta Similar ao /status**, mas focada no pagamento específico.

---

### 5. 🔄 Polling de Pagamento (Recomendado)

**Finalidade:** Endpoint otimizado para verificação automática de status de pagamentos.

```http
POST /poll-payment
```

**Parâmetros Obrigatórios:**
```json
{
  "payment_id": "string"  // ID do pagamento no Mercado Pago
}
```

**Resposta - Pendente (200):**
```json
{
  "status": "pending",
  "payment_status": "pending",
  "status_detail": "pending_waiting_payment",
  "message": "Pagamento ainda não foi aprovado",
  "payment_id": "115712162800",
  "checked_at": "2025-01-20T15:32:00.000Z"
}
```

**Resposta - Aprovado (200):**
```json
{
  "status": "approved",
  "payment_status": "approved",
  "status_detail": "accredited",
  "message": "Pagamento aprovado e processado com sucesso",
  "payment_id": "115712162800",
  "processed_at": "2025-01-20T15:31:45.000Z",
  "username": "user_12345",
  "password": "pass_67890",
  "plano": "Plano 1 Hora - 5MB",
  "duracao": 60,
  "fim": "2025-01-20T16:31:45.000Z"
}
```

**Resposta - Rejeitado/Expirado (200):**
```json
{
  "status": "rejected",
  "payment_status": "rejected",
  "status_detail": "expired",
  "message": "Pagamento expirado ou rejeitado",
  "payment_id": "115712162800",
  "checked_at": "2025-01-20T15:40:00.000Z"
}
```

**Implementação de Polling Inteligente:**
```javascript
class PaymentPoller {
  constructor(paymentId, onSuccess, onError, onTimeout) {
    this.paymentId = paymentId;
    this.onSuccess = onSuccess;
    this.onError = onError;
    this.onTimeout = onTimeout;
    this.interval = null;
    this.timeout = null;
    this.attempts = 0;
    this.maxAttempts = 120; // 10 minutos (5seg * 120)
  }

  start() {
    console.log(`[POLLING] Iniciando verificação do pagamento ${this.paymentId}`);
    
    this.interval = setInterval(() => {
      this.checkPayment();
    }, 5000); // Verifica a cada 5 segundos

    // Timeout após 10 minutos
    this.timeout = setTimeout(() => {
      this.stop();
      this.onTimeout('Tempo limite de verificação excedido');
    }, 600000);
  }

  async checkPayment() {
    this.attempts++;
    
    try {
      const response = await fetch('http://localhost:3000/api/captive-check/poll-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': `poll-${this.paymentId}-${this.attempts}`
        },
        body: JSON.stringify({
          payment_id: this.paymentId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      console.log(`[POLLING] Tentativa ${this.attempts}: ${data.status}`);

      if (data.status === 'approved') {
        this.stop();
        this.onSuccess(data);
      } else if (data.status === 'rejected' || data.status === 'cancelled') {
        this.stop();
        this.onError(`Pagamento ${data.status}: ${data.message}`);
      } else if (this.attempts >= this.maxAttempts) {
        this.stop();
        this.onTimeout('Número máximo de tentativas excedido');
      }

    } catch (error) {
      console.error(`[POLLING] Erro na tentativa ${this.attempts}:`, error);
      
      if (this.attempts >= this.maxAttempts) {
        this.stop();
        this.onError(`Erro na verificação: ${error.message}`);
      }
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    console.log(`[POLLING] Verificação finalizada após ${this.attempts} tentativas`);
  }
}

// Exemplo de uso
function iniciarVerificacaoPagamento(paymentId) {
  const poller = new PaymentPoller(
    paymentId,
    // OnSuccess
    (data) => {
      console.log('✅ Pagamento aprovado!');
      mostrarCredenciais(data.username, data.password);
      salvarCredenciais(data);
    },
    // OnError
    (error) => {
      console.error('❌ Erro no pagamento:', error);
      mostrarMensagemErro(error);
    },
    // OnTimeout
    (message) => {
      console.warn('⏰ Timeout:', message);
      mostrarMensagemTimeout();
    }
  );

  poller.start();
  return poller; // Para permitir parar manualmente se necessário
}
```

## 💾 Modelos de Dados

### Estrutura MAC Address
```typescript
interface MacAddress {
  id: string;                    // UUID único
  mac_address: string;           // Formato AA:BB:CC:DD:EE:FF
  mikrotik_id: string;          // UUID do Mikrotik
  status: 'coletado' | 'ativo'; // Status do dispositivo
  primeiro_acesso: string;       // ISO DateTime
  ultimo_acesso: string | null;  // ISO DateTime
  total_compras: number;         // Quantidade de compras
  ultimo_plano: string;         // Nome do último plano
  ultimo_valor: number;         // Valor da última compra
  total_gasto: number;          // Total gasto historicamente
  status_pagamento: 'aguardando' | 'aprovado' | 'expirado';
  chave_pix: string;            // Chave PIX do último pagamento
  qrcode: string;               // QR Code em base64
  pagamento_aprovado_em: string | null; // ISO DateTime
}
```

### Estrutura de Venda/Transação
```typescript
interface Venda {
  id: string;                   // UUID único
  mac_id: string;              // UUID do MAC
  plano_id: string;            // UUID do plano
  mikrotik_id: string;         // UUID do Mikrotik
  preco: number;               // Valor cobrado
  descricao: string;           // Descrição do serviço
  status: 'aguardando' | 'pendente' | 'aprovado' | 'expirado' | 'cancelado';
  payment_id: string;          // ID no Mercado Pago
  chave_pix: string;           // Chave PIX
  qrcode: string;              // QR Code base64
  ticket_url: string;          // URL do ticket
  data: string;                // ISO DateTime de criação
  pagamento_gerado_em: string; // ISO DateTime
  pagamento_aprovado_em: string | null; // ISO DateTime
  senha_id: string | null;     // UUID da senha utilizada
}
```

### Estrutura do Plano
```typescript
interface Plano {
  id: string;          // UUID único
  nome: string;        // Nome do plano
  preco: number;       // Preço em BRL
  duracao: number;     // Duração em minutos
  velocidade: number;  // Velocidade em Mbps (opcional)
  mikrotik_id: string; // UUID do Mikrotik
  ativo: boolean;      // Se o plano está ativo
  created_at: string;  // ISO DateTime
  updated_at: string;  // ISO DateTime
}
```

### Estrutura da Senha/Credencial
```typescript
interface Senha {
  id: string;           // UUID único
  usuario: string;      // Nome de usuário
  senha: string;        // Senha
  plano_id: string;     // UUID do plano
  vendida: boolean;     // Se foi vendida
  vendida_em: string | null; // ISO DateTime quando foi vendida
  created_at: string;   // ISO DateTime de criação
}
```

## 💻 Exemplos Práticos

### Exemplo Completo - React Hook

```jsx
import { useState, useEffect, useCallback } from 'react';

const usePixPayment = (mac, mikrotikId) => {
  const [status, setStatus] = useState('loading');
  const [pixData, setPixData] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [error, setError] = useState(null);
  const [polling, setPolling] = useState(false);

  const API_BASE = 'http://localhost:3000/api/captive-check';

  const checkStatus = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac, mikrotik_id: mikrotikId })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      setStatus(data.status);
      
      if (data.status === 'autenticado') {
        setCredentials({
          username: data.username,
          password: data.password,
          plano: data.plano,
          duracao: data.duracao,
          fim: data.fim
        });
      } else if (data.status === 'pendente') {
        setPixData(data.pagamento_pendente);
      }
      
      return data;
    } catch (err) {
      setError(err.message);
      setStatus('error');
      throw err;
    }
  }, [mac, mikrotikId]);

  const generatePix = async (planoId, preco, descricao) => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE}/pix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mac,
          plano_id: planoId,
          mikrotik_id: mikrotikId,
          preco,
          descricao
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setPixData(data);
      setStatus('pendente');
      
      // Iniciar polling automático
      startPolling(data.id);
      
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const startPolling = (paymentId) => {
    setPolling(true);
    
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/poll-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_id: paymentId })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (data.status === 'approved') {
          setPolling(false);
          setStatus('autenticado');
          setCredentials({
            username: data.username,
            password: data.password,
            plano: data.plano,
            duracao: data.duracao,
            fim: data.fim
          });
          clearInterval(interval);
        } else if (data.status === 'rejected') {
          setPolling(false);
          setStatus('rejeitado');
          setError(data.message);
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Erro no polling:', err);
      }
    }, 5000);

    // Para o polling após 10 minutos
    setTimeout(() => {
      clearInterval(interval);
      setPolling(false);
      if (status === 'pendente') {
        setStatus('expirado');
        setError('Tempo limite de pagamento excedido');
      }
    }, 600000);
  };

  // Verificar status inicial ao montar o componente
  useEffect(() => {
    if (mac && mikrotikId) {
      checkStatus();
    }
  }, [mac, mikrotikId, checkStatus]);

  return {
    status,
    pixData,
    credentials,
    error,
    polling,
    checkStatus,
    generatePix
  };
};

// Componente de exemplo usando o hook
const CaptivePortal = ({ userMac, mikrotikId, availablePlans }) => {
  const { 
    status, 
    pixData, 
    credentials, 
    error, 
    polling, 
    generatePix 
  } = usePixPayment(userMac, mikrotikId);

  const handlePlanSelect = async (plan) => {
    try {
      await generatePix(plan.id, plan.preco, `${plan.nome} - ${plan.duracao}min`);
    } catch (err) {
      alert(`Erro ao gerar PIX: ${err.message}`);
    }
  };

  if (status === 'loading') {
    return <div>Verificando status...</div>;
  }

  if (status === 'error') {
    return <div>Erro: {error}</div>;
  }

  if (status === 'autenticado') {
    return (
      <div className="success">
        <h2>✅ Acesso Liberado!</h2>
        <div className="credentials">
          <p><strong>Usuário:</strong> {credentials.username}</p>
          <p><strong>Senha:</strong> {credentials.password}</p>
          <p><strong>Plano:</strong> {credentials.plano}</p>
          <p><strong>Válido até:</strong> {new Date(credentials.fim).toLocaleString()}</p>
        </div>
      </div>
    );
  }

  if (status === 'pendente' && pixData) {
    return (
      <div className="payment-pending">
        <h2>💳 Pagamento Pendente</h2>
        <div className="qr-code">
          <img 
            src={`data:image/png;base64,${pixData.qrcode}`}
            alt="QR Code PIX"
            style={{ maxWidth: '300px' }}
          />
        </div>
        <div className="pix-info">
          <p><strong>Valor:</strong> R$ {pixData.valor?.toFixed(2)}</p>
          <p><strong>Chave PIX:</strong></p>
          <textarea 
            readOnly 
            value={pixData.chave_pix}
            style={{ width: '100%', height: '60px', fontSize: '12px' }}
          />
        </div>
        {polling && (
          <div className="polling-indicator">
            <p>🔄 Verificando pagamento automaticamente...</p>
          </div>
        )}
      </div>
    );
  }

  if (status === 'precisa_comprar') {
    return (
      <div className="plan-selection">
        <h2>📶 Escolha seu Plano</h2>
        <div className="plans">
          {availablePlans.map(plan => (
            <div key={plan.id} className="plan-card">
              <h3>{plan.nome}</h3>
              <p>Duração: {plan.duracao} minutos</p>
              <p>Preço: R$ {plan.preco.toFixed(2)}</p>
              <button onClick={() => handlePlanSelect(plan)}>
                Escolher Plano
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <div>Status desconhecido: {status}</div>;
};

export default CaptivePortal;
```

### Exemplo Backend - Express Middleware

```javascript
// middleware/captivePortalValidator.js
const validateMacAddress = (req, res, next) => {
  const { mac } = req.body;
  
  if (!mac) {
    return res.status(400).json({
      error: 'MAC Address é obrigatório',
      code: 'MISSING_MAC_ADDRESS'
    });
  }

  // Validar formato MAC Address
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  if (!macRegex.test(mac)) {
    return res.status(400).json({
      error: 'Formato de MAC Address inválido',
      code: 'INVALID_MAC_FORMAT',
      expected_format: 'AA:BB:CC:DD:EE:FF'
    });
  }

  // Normalizar MAC Address (maiúsculo, com :)
  req.body.mac = mac.toUpperCase().replace(/-/g, ':');
  next();
};

const validateMikrotikId = (req, res, next) => {
  const { mikrotik_id } = req.body;
  
  if (!mikrotik_id) {
    return res.status(400).json({
      error: 'ID do Mikrotik é obrigatório',
      code: 'MISSING_MIKROTIK_ID'
    });
  }

  // Validar formato UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(mikrotik_id)) {
    return res.status(400).json({
      error: 'Formato de UUID inválido para Mikrotik ID',
      code: 'INVALID_UUID_FORMAT'
    });
  }

  next();
};

module.exports = {
  validateMacAddress,
  validateMikrotikId
};

// Usar no roteamento
const express = require('express');
const { validateMacAddress, validateMikrotikId } = require('./middleware/captivePortalValidator');

app.post('/api/captive-check/status', 
  validateMacAddress, 
  validateMikrotikId, 
  async (req, res) => {
    // Lógica do endpoint...
  }
);
```

## 🐛 Troubleshooting

### Problemas Comuns e Soluções

#### 1. Erro de Conexão com Supabase
```
Erro: Failed to fetch from Supabase
```

**Soluções:**
- Verificar se `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão corretos
- Testar conectividade: `curl -H "apikey: SUA_KEY" https://seu-projeto.supabase.co/rest/v1/`
- Verificar políticas RLS (Row Level Security) no Supabase

#### 2. Erro de Pagamento Mercado Pago
```
Erro: Invalid transaction_amount
```

**Soluções:**
- Verificar se `MERCADO_PAGO_ACCESS_TOKEN` é válido
- Confirmar que o valor está em formato numérico (não string)
- Verificar se a conta do Mercado Pago está ativa

#### 3. MAC Address Não Encontrado
```
Status: precisa_comprar sempre retornado
```

**Soluções:**
- Verificar formato do MAC (usar : ao invés de -)
- Confirmar se o Mikrotik está cadastrado e ativo
- Verificar se o campo `status` na tabela mikrotiks é 'Ativo' (case-sensitive)

#### 4. Polling Não Detecta Pagamento
```
Pagamento aprovado mas polling não para
```

**Soluções:**
- Verificar logs do endpoint `/poll-payment`
- Confirmar se o `payment_id` está correto
- Testar manualmente: `POST /poll-payment` com o payment_id

### Debug Avançado

#### Habilitar Logs Detalhados
```javascript
// No início do arquivo api.cjs
const DEBUG = process.env.NODE_ENV === 'development';

function debugLog(tag, data) {
  if (DEBUG) {
    console.log(`[${new Date().toISOString()}] [${tag}]`, JSON.stringify(data, null, 2));
  }
}

// Usar em cada endpoint
app.post('/status', async (req, res) => {
  debugLog('STATUS-REQUEST', req.body);
  
  try {
    const result = await processStatus(req.body);
    debugLog('STATUS-RESPONSE', result);
    res.json(result);
  } catch (error) {
    debugLog('STATUS-ERROR', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});
```

#### Monitoramento de Performance
```javascript
// middleware/performance.js
const performanceMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[PERF] ${req.method} ${req.path} - ${duration}ms - ${res.statusCode}`);
    
    // Alertar se requisição demorar muito
    if (duration > 5000) {
      console.warn(`[PERF WARNING] Requisição lenta detectada: ${duration}ms`);
    }
  });
  
  next();
};

module.exports = performanceMiddleware;
```

## 📊 Monitoramento

### Métricas Importantes
1. **Taxa de Conversão PIX:** Pagamentos gerados vs. aprovados
2. **Tempo Médio de Aprovação:** Tempo entre geração e aprovação
3. **Erros por Endpoint:** Monitorar falhas por rota
4. **Performance:** Tempo de resposta por endpoint

### Health Check Avançado
```javascript
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {}
  };

  // Testar Supabase
  try {
    const { data, error } = await supabase
      .from('mikrotiks')
      .select('id')
      .limit(1);
    health.services.supabase = error ? 'error' : 'ok';
  } catch (error) {
    health.services.supabase = 'error';
  }

  // Testar Mercado Pago
  try {
    const response = await fetch('https://api.mercadopago.com/v1/payments/search', {
      headers: {
        'Authorization': `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    health.services.mercadopago = response.ok ? 'ok' : 'error';
  } catch (error) {
    health.services.mercadopago = 'error';
  }

  const overallStatus = Object.values(health.services).every(s => s === 'ok') ? 'ok' : 'degraded';
  health.status = overallStatus;

  res.status(overallStatus === 'ok' ? 200 : 503).json(health);
});
```

## 🔄 Integração com Webhook

### Configurando Webhook do Mercado Pago

```javascript
// endpoint para receber webhooks do Mercado Pago
app.post('/webhook/mercadopago', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];
    
    // Verificar assinatura (recomendado para produção)
    // const isValid = verifyWebhookSignature(req.body, signature, process.env.WEBHOOK_SECRET);
    // if (!isValid) return res.status(401).send('Unauthorized');

    const notification = JSON.parse(req.body);
    
    console.log('[WEBHOOK] Recebido:', notification);

    if (notification.type === 'payment') {
      const paymentId = notification.data.id;
      
      // Processar o pagamento
      await processPaymentNotification(paymentId);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[WEBHOOK] Erro:', error);
    res.status(500).send('Internal Server Error');
  }
});

async function processPaymentNotification(paymentId) {
  try {
    // Buscar pagamento no Mercado Pago
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Erro ao buscar pagamento: ${response.status}`);
    }

    const payment = await response.json();
    
    if (payment.status === 'approved') {
      // Buscar venda correspondente
      const { data: vendas, error } = await supabase
        .from('vendas')
        .select('*')
        .eq('payment_id', paymentId)
        .eq('status', 'pendente');

      if (error) throw error;

      if (vendas && vendas.length > 0) {
        const venda = vendas[0];
        
        // Processar venda (mesmo código do polling)
        await processApprovedSale(venda);
        
        console.log(`[WEBHOOK] Venda processada via webhook: ${venda.id}`);
      }
    }

  } catch (error) {
    console.error('[WEBHOOK] Erro ao processar notificação:', error);
  }
}
```

### URL do Webhook
Para configurar no Mercado Pago:
```
https://seu-dominio.com/webhook/mercadopago
```

## 🔒 Segurança

### Recomendações de Segurança

1. **HTTPS em Produção:** Sempre usar HTTPS para proteger dados sensíveis
2. **Rate Limiting:** Implementar limitação de requisições por IP
3. **Validação de Entrada:** Sempre validar todos os parâmetros
4. **Logs Seguros:** Não loggar senhas ou tokens em texto plano
5. **Webhook Signature:** Verificar assinatura dos webhooks do Mercado Pago

### Implementação de Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const pixRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 3, // máximo 3 tentativas por minuto por IP
  message: {
    error: 'Muitas tentativas de geração de PIX. Tente novamente em 1 minuto.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/captive-check/pix', pixRateLimit, async (req, res) => {
  // Lógica do endpoint...
});
```

---

**📞 Suporte Técnico**

Para dúvidas ou problemas com a API:
1. Consulte esta documentação
2. Verifique os logs da aplicação
3. Teste endpoints individualmente
4. Confirme configurações de ambiente

**🔗 Links Úteis**
- [Documentação Mercado Pago](https://www.mercadopago.com.br/developers)
- [Documentação Supabase](https://supabase.com/docs)
- [Status da API (Health Check)](http://localhost:3000/api/captive-check/)

---

## 📊 Vendas Recentes por Mikrotik

### 6. ⏰ Relatório de Vendas Recentes (Últimos 10 minutos)

**Finalidade:** Listar todos os MACs que compraram senhas nos últimos 10 minutos para um Mikrotik específico.

```http
GET /recent-sales/{mikrotik_id}
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

**Exemplo cURL:**
```bash
curl -X GET http://localhost:3000/api/recent-sales/550e8400-e29b-41d4-a716-446655440000
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
        return;
      }
      
      const vendas = data.trim().split('\n');
      console.log(`Encontradas ${vendas.length} vendas nos últimos 10 minutos:`);
      
      // Formato: usuario-senha-mac-minutos
      vendas.forEach((venda, index) => {
        const [usuario, senha, mac, minutos] = venda.split('-');
        console.log(`${index + 1}. Usuario: ${usuario}, MAC: ${mac}, Duração: ${minutos}min`);
      });
    } else {
      console.error('Erro na requisição:', response.status);
    }
  } catch (error) {
    console.error('Erro na requisição:', error);
  }
}

// Exemplo de uso
obterVendasRecentes('550e8400-e29b-41d4-a716-446655440000');
```

**Formato de Resposta:**
O retorno é um texto plano com uma venda por linha no formato:
```
usuario-senha-mac-minutos
```

Onde:
- `usuario`: Nome de usuário da credencial
- `senha`: Senha da credencial  
- `mac`: Endereço MAC do dispositivo
- `minutos`: Duração do plano em minutos

**Casos de Uso:**
- Monitoramento de vendas em tempo real
- Integração com sistemas Mikrotik
- Alertas de vendas recentes
- Dashboard de atividade em tempo real

**Horário de Referência:**
- Considera os últimos 10 minutos a partir do momento da consulta
- Inclui apenas vendas aprovadas
- Ordenação por horário de aprovação do pagamento (mais recente primeiro)

---
*Documentação gerada automaticamente • Versão 1.0 • Última atualização: 2025-01-20*