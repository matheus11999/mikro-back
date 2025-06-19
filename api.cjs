const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();
const path = require('path');

// Validação de variáveis de ambiente
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MERCADO_PAGO_ACCESS_TOKEN'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Erro: Variável de ambiente ${envVar} não definida`);
    process.exit(1);
  }
}

// Inicialização dos clientes
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Configuração do Mercado Pago com timeout
const mp = new MercadoPagoConfig({ 
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
  options: { timeout: 5000 }
});

const payment = new Payment(mp);

// Configuração do Express
const app = express();
app.use(express.json());
app.use(cors());

// Middleware de log
const logRequest = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    body: req.body,
    query: req.query
  });
  next();
};

app.use(logRequest);

// Função utilitária para normalizar campos do MAC
function normalizaMac(macObj) {
  if (!macObj) return null;
  return {
    ...macObj,
    ultimo_acesso: macObj.ultimo_acesso || '',
    ultimo_plano: macObj.ultimo_plano || '',
    ultimo_valor: macObj.ultimo_valor || 0,
    total_compras: macObj.total_compras || 0,
    total_gasto: macObj.total_gasto || 0,
    chave_pix: macObj.chave_pix || '',
    qrcode: macObj.qrcode || '',
    pagamento_aprovado_em: macObj.pagamento_aprovado_em || ''
  };
}

// Função utilitária para validar MAC address
function isValidMac(mac) {
  return /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac);
}

// Função utilitária para tratar erros do Supabase
async function handleSupabaseOperation(operation) {
  try {
    const { data, error } = await operation();
    if (error) {
      console.error('Erro Supabase:', error);
      throw {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        source: 'Supabase'
      };
    }
    return data;
  } catch (err) {
    if (err.code) throw err; // Já é um erro formatado
    throw {
      message: 'Erro na operação do banco de dados',
      code: 'SUPABASE_ERROR',
      details: err.message,
      source: 'Supabase'
    };
  }
}

// Função utilitária para tratar erros do Mercado Pago
async function handleMercadoPagoOperation(operation) {
  try {
    const result = await operation();
    return result;
  } catch (err) {
    console.error('Erro Mercado Pago:', err);
    
    // Mapeamento de erros específicos do Mercado Pago
    let errorMessage = 'Erro ao processar pagamento no Mercado Pago';
    let errorCode = err.code || 'MERCADOPAGO_ERROR';
    let errorDetails = err.message;

    if (err.status === 400) {
      errorMessage = 'Requisição inválida ao Mercado Pago';
      errorCode = 'MERCADOPAGO_INVALID_REQUEST';
    } else if (err.status === 401) {
      errorMessage = 'Credenciais inválidas do Mercado Pago';
      errorCode = 'MERCADOPAGO_UNAUTHORIZED';
    } else if (err.status === 404) {
      errorMessage = 'Recurso não encontrado no Mercado Pago';
      errorCode = 'MERCADOPAGO_NOT_FOUND';
    }

    throw {
      message: errorMessage,
      code: errorCode,
      details: errorDetails,
      source: 'MercadoPago',
      originalError: process.env.NODE_ENV === 'development' ? err : undefined
    };
  }
}

// Middleware de erro global
const errorHandler = (err, req, res, next) => {
  console.error('Erro detalhado:', err);

  // Formata a resposta de erro
  const errorResponse = {
    error: err.message || 'Erro interno do servidor',
    code: err.code || 'INTERNAL_ERROR',
    details: err.details || err.message,
    source: err.source || 'API',
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      originalError: err.originalError
    })
  };

  // Define o status HTTP baseado no código de erro
  let status = 500;
  if (err.code === 'VALIDATION_ERROR') status = 400;
  if (err.code === 'NOT_FOUND') status = 404;
  if (err.code === 'UNAUTHORIZED') status = 401;
  if (err.code === 'FORBIDDEN') status = 403;

  res.status(status).json(errorResponse);
};

// Endpoint para teste de acessibilidade da API
app.get('/api/captive-check', (req, res) => {
  res.json({ status: 'ok', message: 'API está funcionando!' });
});

// 1. Status do MAC
app.post('/api/captive-check/status', async (req, res, next) => {
  try {
    const { mac, mikrotik_id } = req.body;
    console.log('[STATUS] Recebido:', { mac, mikrotik_id });

    if (!mac || !isValidMac(mac)) {
      throw {
        message: 'MAC inválido',
        code: 'VALIDATION_ERROR',
        details: 'Formato esperado: XX:XX:XX:XX:XX:XX',
        source: 'API'
      };
    }

    if (!mikrotik_id) {
      throw {
        message: 'mikrotik_id obrigatório',
        code: 'VALIDATION_ERROR',
        details: 'O ID do Mikrotik é obrigatório',
        source: 'API'
      };
    }

    // Busca MAC existente
    const macs = await handleSupabaseOperation(() => 
      supabaseAdmin
        .from('macs')
        .select('*')
        .eq('mac_address', mac)
    );

    let macObj = macs && macs[0];

    if (!macObj) {
      const novoMac = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('macs')
          .insert([{
            mac_address: mac,
            mikrotik_id,
            status: 'coletado',
            primeiro_acesso: new Date().toISOString(),
            ultimo_acesso: null,
            total_compras: 0,
            ultimo_plano: '',
            ultimo_valor: 0,
            total_gasto: 0,
            status_pagamento: 'aguardando',
            chave_pix: '',
            qrcode: '',
            pagamento_aprovado_em: null
          }])
          .select()
          .single()
      );

      macObj = novoMac;
      return res.json({
        status: 'novo_mac',
        mensagem: `Novo Mac Adicionado ${mac}`,
        mac: normalizaMac(macObj)
      });
    }

    // Atualiza mikrotik_id se necessário
    if (mikrotik_id && macObj.mikrotik_id !== mikrotik_id) {
      const updatedMac = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('macs')
          .update({ mikrotik_id })
          .eq('id', macObj.id)
          .select()
          .single()
      );

      macObj = updatedMac;
    }

    // Busca vendas aprovadas
    const vendas = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select(`
          *,
          senha_id (*),
          plano_id (*),
          mikrotik_id (*)
        `)
        .eq('mac_id', macObj.id)
        .eq('status', 'aprovado')
        .order('data', { ascending: false })
    );

    const agora = new Date();
    let senhaValida = null;

    if (vendas && vendas.length > 0) {
      for (const venda of vendas) {
        const inicio = new Date(venda.data);
        const duracao = venda.plano_id?.duracao || 60;
        const fim = new Date(inicio.getTime() + duracao * 60000);

        if (agora < fim) {
          senhaValida = venda;
          break;
        }
      }
    }

    if (senhaValida) {
      return res.json({
        status: 'autenticado',
        username: senhaValida.senha_id?.usuario,
        password: senhaValida.senha_id?.senha,
        plano: senhaValida.plano_id?.nome,
        duracao: senhaValida.plano_id?.duracao,
        fim: senhaValida.data ? 
          new Date(new Date(senhaValida.data).getTime() + 
          (senhaValida.plano_id?.duracao || 60) * 60000).toISOString() : 
          null
      });
    }

    return res.json({ status: 'precisa_comprar' });

  } catch (err) {
    next(err);
  }
});

// 2. Gerar Pix
app.post('/api/captive-check/pix', async (req, res, next) => {
  try {
    const { mac, plano_id, mikrotik_id, preco, descricao, payer } = req.body;
    console.log('[PIX] Recebido:', { mac, plano_id, mikrotik_id, preco, descricao, payer });

    // Validação de campos
    const requiredFields = { mac, plano_id, mikrotik_id, preco };
    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value)
      .map(([field]) => field);

    if (missingFields.length > 0) {
      throw {
        message: 'Campos obrigatórios ausentes',
        code: 'VALIDATION_ERROR',
        details: `Campos ausentes: ${missingFields.join(', ')}`,
        source: 'API'
      };
    }

    // Validação extra para preco
    let precoNumerico = 1; // Força o valor para 1 para teste
    console.log('DEBUG preco recebido (forçado para teste):', preco, '-> precoNumerico:', precoNumerico, 'Tipo:', typeof precoNumerico);
    if (precoNumerico === null || isNaN(precoNumerico) || precoNumerico <= 0) {
      console.error('Erro: preco inválido recebido:', preco, 'Tipo:', typeof preco);
      throw {
        message: 'Preço inválido para o pagamento Pix',
        code: 'VALIDATION_ERROR',
        details: `O valor do pagamento deve ser um número maior que zero. Valor recebido: ${preco} (tipo: ${typeof preco})`,
        source: 'API'
      };
    }

    if (!isValidMac(mac)) {
      throw {
        message: 'MAC inválido',
        code: 'VALIDATION_ERROR',
        details: 'Formato esperado: XX:XX:XX:XX:XX:XX',
        source: 'API'
      };
    }

    // Busca ou cria MAC
    let macObj;
    try {
      // Busca MAC existente
      const macs = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('macs')
          .select('id, mikrotik_id')
          .eq('mac_address', mac)
      );

      macObj = macs && macs[0];

      // Se não existe, cria novo MAC
      if (!macObj) {
        const novoMac = await handleSupabaseOperation(() =>
          supabaseAdmin
            .from('macs')
            .insert([{
              mac_address: mac,
              mikrotik_id,
              status: 'coletado',
              primeiro_acesso: new Date().toISOString(),
              ultimo_acesso: null,
              total_compras: 0,
              ultimo_plano: '',
              ultimo_valor: 0,
              total_gasto: 0,
              status_pagamento: 'aguardando',
              chave_pix: '',
              qrcode: '',
              pagamento_aprovado_em: null
            }])
            .select()
            .single()
        );

        macObj = novoMac;
      }

      // Atualiza mikrotik_id se necessário
      if (mikrotik_id && macObj.mikrotik_id !== mikrotik_id) {
        const updatedMac = await handleSupabaseOperation(() =>
          supabaseAdmin
            .from('macs')
            .update({ mikrotik_id })
            .eq('id', macObj.id)
            .select()
            .single()
        );

        macObj = updatedMac;
      }

      // Verifica plano
      const plano = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('planos')
          .select('id, nome')
          .eq('id', plano_id)
          .single()
      );

      if (!plano) {
        throw {
          message: 'Plano não encontrado',
          code: 'NOT_FOUND',
          details: `Plano com ID ${plano_id} não existe`,
          source: 'API'
        };
      }

      // Verifica mikrotik
      const mikrotik = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('mikrotiks')
          .select('*')
          .eq('id', mikrotik_id)
          .single()
      );

      if (!mikrotik) {
        throw {
          message: 'Mikrotik não encontrado',
          code: 'NOT_FOUND',
          details: `Mikrotik com ID ${mikrotik_id} não existe`,
          source: 'API'
        };
      }

      // Monta o corpo igual ao CURL
      const paymentData = {
        transaction_amount: precoNumerico, // sempre 1 para teste
        description: descricao || plano.nome,
        payment_method_id: 'pix',
        payer: payer || {
          email: 'comprador@email.com',
          first_name: 'Joao',
          last_name: 'Silva',
          identification: { type: 'CPF', number: '19119119100' },
          address: {
            zip_code: '06233200',
            street_name: 'Av. das Nações Unidas',
            street_number: '3003',
            neighborhood: 'Bonfim',
            city: 'Osasco',
            federal_unit: 'SP'
          }
        }
      };

      // LOG DETALHADO PARA DEBUG
      console.log('DEBUG paymentData:', paymentData, 'typeof transaction_amount:', typeof paymentData.transaction_amount);
      if (paymentData.transaction_amount === null || typeof paymentData.transaction_amount !== 'number' || isNaN(paymentData.transaction_amount) || paymentData.transaction_amount <= 0) {
        console.error('Erro: transaction_amount inválido antes de chamar Mercado Pago:', paymentData);
        return res.status(400).json({
          error: 'transaction_amount inválido antes de chamar Mercado Pago',
          details: paymentData
        });
      }

      // Chamada usando SDK oficial do Mercado Pago
      let mpData;
      try {
        mpData = await payment.create(paymentData);
      } catch (err) {
        console.error('Erro Mercado Pago (SDK):', err);
        // Fallback: chamada manual via fetch igual ao curl
        try {
          const idempotencyKey = `test-pix-${Date.now()}`;
          const fetchPayload = {
            transaction_amount: paymentData.transaction_amount,
            description: paymentData.description,
            payment_method_id: paymentData.payment_method_id,
            payer: paymentData.payer
          };
          console.log('FALLBACK FETCH: payload', fetchPayload);
          const fetchRes = await fetch('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
              'X-Idempotency-Key': idempotencyKey
            },
            body: JSON.stringify(fetchPayload)
          });
          const fetchData = await fetchRes.json();
          console.log('FALLBACK FETCH: resposta', fetchData);
          if (!fetchRes.ok) {
            return res.status(fetchRes.status).json({
              error: 'Erro ao processar pagamento no Mercado Pago (fetch)',
              code: 'MERCADOPAGO_ERROR_FETCH',
              details: fetchData,
              status: fetchRes.status,
              payload_enviado: fetchPayload
            });
          }
          mpData = fetchData;
        } catch (fetchErr) {
          console.error('Erro Mercado Pago (fetch):', fetchErr);
          return res.status(500).json({
            error: 'Erro ao processar pagamento no Mercado Pago (fetch)',
            code: 'MERCADOPAGO_ERROR_FETCH',
            details: fetchErr,
            status: 500
          });
        }
      }

      // Salva venda
      await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('vendas')
          .insert([{
            mac_id: macObj.id,
            plano_id,
            mikrotik_id,
            preco: precoNumerico, // sempre 1 para teste
            descricao: descricao || plano.nome,
            status: 'aguardando',
            payment_id: mpData.id,
            chave_pix: mpData.point_of_interaction?.transaction_data?.qr_code,
            qrcode: mpData.point_of_interaction?.transaction_data?.qr_code_base64,
            data: new Date().toISOString()
          }])
      );

      // Retorna igual ao CURL
      return res.json({
        ...mpData,
        chave_pix: mpData.point_of_interaction?.transaction_data?.qr_code,
        qrcode: mpData.point_of_interaction?.transaction_data?.qr_code_base64,
        ticket_url: mpData.point_of_interaction?.transaction_data?.ticket_url
      });

    } catch (err) {
      next(err);
    }
  } catch (err) {
    next(err);
  }
});

// 3. Verificar status do pagamento
app.post('/api/captive-check/verify', async (req, res, next) => {
  try {
    const { payment_id } = req.body;

    if (!payment_id) {
      throw {
        message: 'payment_id obrigatório',
        code: 'VALIDATION_ERROR',
        details: 'O ID do pagamento é obrigatório',
        source: 'API'
      };
    }

    const paymentResult = await handleMercadoPagoOperation(async () => {
      return await payment.get(payment_id);
    });

    const status = paymentResult.status;

    // Buscar venda
    const vendas = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('*')
        .eq('payment_id', payment_id)
    );

    const venda = vendas && vendas[0];
    if (!venda) {
      throw {
        message: 'Venda não encontrada',
        code: 'NOT_FOUND',
        details: `Venda com payment_id ${payment_id} não existe`,
        source: 'API'
      };
    }

    // Atualiza status se aprovado
    if (status === 'approved' && venda.status !== 'aprovado') {
      await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('vendas')
          .update({
            status: 'aprovado',
            pagamento_aprovado_em: new Date().toISOString()
          })
          .eq('payment_id', payment_id)
      );
    }

    return res.json({ status });

  } catch (err) {
    next(err);
  }
});

// Registra o middleware de erro no final
app.use(errorHandler);

const FRONTEND_BUILD_PATH = process.env.FRONTEND_BUILD_PATH || path.join(__dirname, 'dist');

// Servir frontend se APP_MODE=backend ou both e existir build
if (process.env.APP_MODE !== 'frontend') {
  app.use(express.static(FRONTEND_BUILD_PATH));
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_BUILD_PATH, 'index.html'));
  });
}

// Porta
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
  if (process.env.APP_MODE === 'backend' || !process.env.APP_MODE) {
    console.log(`API disponível em: http://localhost:${port}/`);
  }
  if (process.env.APP_MODE === 'both') {
    console.log(`API disponível em: http://localhost:${port}/`);
    console.log(`Frontend disponível em: http://localhost:${process.env.FRONTEND_PORT || 5173}/`);
  }
}); 