const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
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

// Mercado Pago será acessado via fetch API diretamente

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

// Função utilitária para tratar respostas do Mercado Pago via fetch
async function handleMercadoPagoFetch(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Erro Mercado Pago (fetch):', data);
      throw {
        message: 'Erro ao processar requisição no Mercado Pago',
        code: 'MERCADOPAGO_ERROR',
        details: data,
        status: response.status,
        source: 'MercadoPago'
      };
    }

    return data;
  } catch (err) {
    if (err.code) throw err; // Já é um erro formatado
    throw {
      message: 'Erro na comunicação com Mercado Pago',
      code: 'MERCADOPAGO_NETWORK_ERROR',
      details: err.message,
      source: 'MercadoPago'
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

// Endpoint para listar planos disponíveis
app.post('/api/captive-check/planos', async (req, res, next) => {
  try {
    const { mikrotik_id } = req.body;
    
    if (!mikrotik_id) {
      throw {
        message: 'mikrotik_id obrigatório',
        code: 'VALIDATION_ERROR',
        details: 'O ID do Mikrotik é obrigatório',
        source: 'API'
      };
    }

    console.log('[PLANOS] Buscando planos para mikrotik:', mikrotik_id);

    // Buscar planos para o mikrotik
    const planos = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('planos')
        .select('*')
        .eq('mikrotik_id', mikrotik_id)
        .order('preco')
    );

    if (!planos || planos.length === 0) {
      return res.json({
        planos: [],
        message: 'Nenhum plano disponível para este mikrotik'
      });
    }

    // Para cada plano, verificar se há senhas disponíveis
    const planosComDisponibilidade = await Promise.all(
      planos.map(async (plano) => {
        const senhasDisponiveis = await handleSupabaseOperation(() =>
          supabaseAdmin
            .from('senhas')
            .select('id')
            .eq('plano_id', plano.id)
            .eq('vendida', false)
        );

        return {
          ...plano,
          senhas_disponiveis: senhasDisponiveis ? senhasDisponiveis.length : 0,
          disponivel: senhasDisponiveis && senhasDisponiveis.length > 0
        };
      })
    );

    return res.json({
      planos: planosComDisponibilidade,
      total: planosComDisponibilidade.length
    });

  } catch (err) {
    next(err);
  }
});

// 1. Status do MAC
app.post('/api/captive-check/status', async (req, res, next) => {
  try {
    const { mac, mikrotik_id, plano_id } = req.body;
    console.log('[STATUS] Recebido:', { mac, mikrotik_id, plano_id });

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
        status: 'precisa_comprar',
        mac: macObj.mac_address,
        mikrotik_id: macObj.mikrotik_id,
        total_vendas: 0,
        total_gasto: 0,
        ultimo_valor: null,
        ultimo_plano: null
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
    const vendasAprovadas = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select(`*, senha_id (*), plano_id (*), mikrotik_id (*)`)
        .eq('mac_id', macObj.id)
        .eq('status', 'aprovado')
        .order('data', { ascending: false })
    );
    // Busca venda pendente (aguardando/pendente) mais recente
    const vendaPendenteArr = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('*')
        .eq('mac_id', macObj.id)
        .eq('mikrotik_id', mikrotik_id)
        .in('status', ['aguardando', 'pendente'])
        .order('pagamento_gerado_em', { ascending: false })
        .limit(1)
    );
    const vendaPendente = vendaPendenteArr && vendaPendenteArr[0];
    // Estatísticas do MAC
    const totalVendas = vendasAprovadas ? vendasAprovadas.length : 0;
    const totalGasto = vendasAprovadas ? vendasAprovadas.reduce((acc, v) => acc + Number(v.preco || 0), 0) : 0;
    const ultimoValor = vendasAprovadas && vendasAprovadas[0] ? vendasAprovadas[0].preco : null;
    const ultimoPlano = vendasAprovadas && vendasAprovadas[0] ? vendasAprovadas[0].plano_id?.nome || '' : null;
    // Se houver venda pendente, verifica status no Mercado Pago
    if (vendaPendente) {
      console.log('[STATUS] Venda pendente encontrada:', {
        id: vendaPendente.id,
        status: vendaPendente.status,
        payment_id: vendaPendente.payment_id,
        pagamento_aprovado_em: vendaPendente.pagamento_aprovado_em
      });
      
      // Consulta status Mercado Pago
      let statusPagamento = vendaPendente.status;
      let pagamentoAprovadoEm = vendaPendente.pagamento_aprovado_em;
      let pagamentoFoiProcessado = false;
      
      try {
        if (vendaPendente.payment_id && vendaPendente.status !== 'aprovado') {
          console.log('[STATUS] Consultando pagamento no Mercado Pago:', vendaPendente.payment_id);
          
          const paymentResult = await handleMercadoPagoFetch(`https://api.mercadopago.com/v1/payments/${vendaPendente.payment_id}`);
          
          console.log('[STATUS] Resposta Mercado Pago:', {
            id: paymentResult.id,
            status: paymentResult.status,
            status_detail: paymentResult.status_detail,
            transaction_amount: paymentResult.transaction_amount
          });
          
          statusPagamento = paymentResult.status || statusPagamento;
          
          // Se o pagamento foi aprovado no Mercado Pago mas ainda não foi processado no sistema
          if (statusPagamento === 'approved' && vendaPendente.status !== 'aprovado') {
            console.log('[STATUS] Pagamento aprovado detectado, processando...');
            pagamentoAprovadoEm = new Date().toISOString();
            
            // Buscar senha aleatória disponível para o plano
            const senha = await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('senhas')
                .select('*')
                .eq('plano_id', vendaPendente.plano_id)
                .eq('vendida', false)
                .limit(1)
                .single()
            );
            
            if (senha) {
              // Marca senha como vendida
              await handleSupabaseOperation(() =>
                supabaseAdmin
                  .from('senhas')
                  .update({ 
                    vendida: true,
                    vendida_em: new Date().toISOString()
                  })
                  .eq('id', senha.id)
              );
              
              // Buscar dono do mikrotik e porcentagem de lucro
              const mikrotikInfo = await handleSupabaseOperation(() =>
                supabaseAdmin
                  .from('mikrotiks')
                  .select('cliente_id, profitpercentage')
                  .eq('id', mikrotik_id)
                  .single()
              );
              
              let porcentagemLucro = mikrotikInfo?.profitpercentage || 90;
              if (porcentagemLucro > 100) porcentagemLucro = 100;
              if (porcentagemLucro < 0) porcentagemLucro = 0;
              
              const comissaoDono = vendaPendente.preco * (porcentagemLucro / 100);
              const comissaoAdmin = vendaPendente.preco - comissaoDono;
              
              // Atualiza saldo do admin
              await supabaseAdmin.rpc('incrementar_saldo_admin', { valor: comissaoAdmin });
              
              // Atualiza saldo do dono do mikrotik
              if (mikrotikInfo && mikrotikInfo.cliente_id) {
                await supabaseAdmin.rpc('incrementar_saldo_cliente', { 
                  cliente_id: mikrotikInfo.cliente_id, 
                  valor: comissaoDono 
                });
              }
              
              // Atualiza venda
              await handleSupabaseOperation(() =>
                supabaseAdmin
                  .from('vendas')
                  .update({
                    status: 'aprovado',
                    pagamento_aprovado_em: pagamentoAprovadoEm,
                    senha_id: senha.id
                  })
                  .eq('id', vendaPendente.id)
              );
              
              // Busca informações do plano para pegar a duração
              const planoInfo = await handleSupabaseOperation(() =>
                supabaseAdmin
                  .from('planos')
                  .select('nome, duracao')
                  .eq('id', vendaPendente.plano_id)
                  .single()
              );
              
              // Atualiza MAC: incrementa total_gasto e total_compras
              await handleSupabaseOperation(() =>
                supabaseAdmin
                  .from('macs')
                  .update({
                    total_gasto: (macObj.total_gasto || 0) + Number(vendaPendente.preco || 0),
                    total_compras: (macObj.total_compras || 0) + 1,
                    ultimo_plano: planoInfo?.nome || vendaPendente.plano_id,
                    ultimo_valor: vendaPendente.preco,
                    ultimo_acesso: new Date().toISOString(),
                    status_pagamento: 'aprovado',
                    pagamento_aprovado_em: pagamentoAprovadoEm
                  })
                  .eq('id', macObj.id)
              );
              
              console.log('[VENDA APROVADA] Saldo creditado: admin', comissaoAdmin, 'dono', comissaoDono);
              console.log('[VENDA APROVADA] Senha entregue automaticamente:', senha.usuario);
              
              // Marca que o pagamento foi processado para recarregar os dados
              pagamentoFoiProcessado = true;
            }
          }
        }
      } catch (err) {
        console.error('[STATUS] Erro ao consultar Mercado Pago:', err);
        // Se erro, mantém status anterior
      }
      
      // Se o pagamento foi processado, recarrega os dados para mostrar como aprovado
      if (pagamentoFoiProcessado) {
        console.log('[STATUS] Pagamento processado, recarregando dados...');
        // Recarrega vendas aprovadas
        const vendasAprovadasAtualizadas = await handleSupabaseOperation(() =>
          supabaseAdmin
            .from('vendas')
            .select(`*, senha_id (*), plano_id (*), mikrotik_id (*)`)
            .eq('mac_id', macObj.id)
            .eq('status', 'aprovado')
            .order('data', { ascending: false })
        );
        
        if (vendasAprovadasAtualizadas && vendasAprovadasAtualizadas.length > 0) {
          const vendaAprovada = vendasAprovadasAtualizadas[0];
          const duracaoMinutos = vendaAprovada.plano_id?.duracao || 60;
          
          return res.json({
            status: 'autenticado',
            mac: macObj.mac_address,
            mikrotik_id: macObj.mikrotik_id,
            total_vendas: vendasAprovadasAtualizadas.length,
            total_gasto: vendasAprovadasAtualizadas.reduce((acc, v) => acc + Number(v.preco || 0), 0),
            ultimo_valor: vendaAprovada.preco,
            ultimo_plano: vendaAprovada.plano_id?.nome,
            username: vendaAprovada.senha_id?.usuario,
            password: vendaAprovada.senha_id?.senha,
            plano: vendaAprovada.plano_id?.nome,
            duracao: duracaoMinutos,
            fim: new Date(new Date().getTime() + duracaoMinutos * 60000).toISOString()
          });
        }
      }
      
      // Se ainda está pendente, retorna os dados do pagamento pendente
      return res.json({
        status: 'pendente',
        mac: macObj.mac_address,
        mikrotik_id: macObj.mikrotik_id,
        total_vendas: totalVendas,
        total_gasto: totalGasto,
        ultimo_valor: ultimoValor,
        ultimo_plano: ultimoPlano,
        pagamento_pendente: {
          status: statusPagamento,
          pagamento_gerado_em: vendaPendente.pagamento_gerado_em,
          chave_pix: vendaPendente.chave_pix,
          qrcode: vendaPendente.qrcode,
          valor: vendaPendente.preco,
          ticket_url: vendaPendente.payment_id,
          payment_id: vendaPendente.payment_id
        }
      });
    }
    // Se houver venda aprovada válida (senha ativa)
    const agora = new Date();
    let senhaValida = null;
    if (vendasAprovadas && vendasAprovadas.length > 0) {
      for (const venda of vendasAprovadas) {
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
        mac: macObj.mac_address,
        mikrotik_id: macObj.mikrotik_id,
        total_vendas: totalVendas,
        total_gasto: totalGasto,
        ultimo_valor: ultimoValor,
        ultimo_plano: ultimoPlano,
        username: senhaValida.senha_id?.usuario,
        password: senhaValida.senha_id?.senha,
        plano: senhaValida.plano_id?.nome,
        duracao: senhaValida.plano_id?.duracao,
        fim: senhaValida.data ? new Date(new Date(senhaValida.data).getTime() + (senhaValida.plano_id?.duracao || 60) * 60000).toISOString() : null
      });
    }
    // Se não houver venda, retorna precisa_comprar e estatísticas
    return res.json({
      status: 'precisa_comprar',
      mac: macObj.mac_address,
      mikrotik_id: macObj.mikrotik_id,
      total_vendas: totalVendas,
      total_gasto: totalGasto,
      ultimo_valor: ultimoValor,
      ultimo_plano: ultimoPlano
    });
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
    let precoNumerico = preco;
    console.log('DEBUG preco recebido:', preco, '-> precoNumerico:', precoNumerico, 'Tipo:', typeof precoNumerico);
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
    let macObj = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .select('id')
        .eq('mac_address', mac)
        .single()
    );
    if (!macObj) {
      macObj = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('macs')
          .insert([{
            mac_address: mac,
            mikrotik_id,
            status: 'coletado',
            primeiro_acesso: new Date().toISOString()
          }])
          .select('id')
          .single()
      );
    }
    // Verifica se já existe venda pendente para este MAC/plano/mikrotik
    const vendaPendente = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('*')
        .eq('mac_id', macObj.id)
        .eq('plano_id', plano_id)
        .eq('mikrotik_id', mikrotik_id)
        .in('status', ['aguardando', 'pendente'])
        .order('pagamento_gerado_em', { ascending: false })
        .limit(1)
    );
    if (vendaPendente && vendaPendente.length > 0) {
      return res.status(400).json({
        error: 'Já existe um pagamento pendente para este MAC/plano/mikrotik.',
        code: 'PENDING_PAYMENT_EXISTS'
      });
    }
    // Busca senha disponível apenas pelo plano
    const senhaDisponivel = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('senhas')
        .select('id')
        .eq('plano_id', plano_id)
        .eq('vendida', false)
        .limit(1)
        .maybeSingle()
    );
    if (!senhaDisponivel) {
      return res.status(400).json({
        error: 'Não há senhas disponíveis para este plano. Contate o administrador.',
        code: 'NO_PASSWORD_AVAILABLE'
      });
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

    // Monta o corpo da requisição
    const paymentData = {
      transaction_amount: precoNumerico,
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

    // Cria pagamento PIX via Mercado Pago
    console.log('GERANDO PIX: payload', paymentData);
    
    const idempotencyKey = `pix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const mpData = await handleMercadoPagoFetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(paymentData)
    });

    console.log('PIX GERADO: status OK, payment_id', mpData.id);

    // Salva venda
    await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .insert([{
          mac_id: macObj.id,
          plano_id,
          mikrotik_id,
          preco: precoNumerico,
          descricao: descricao || plano.nome,
          status: 'aguardando',
          payment_id: mpData.id,
          chave_pix: mpData.point_of_interaction?.transaction_data?.qr_code,
          qrcode: mpData.point_of_interaction?.transaction_data?.qr_code_base64,
          ticket_url: mpData.id,
          data: new Date().toISOString(),
          pagamento_gerado_em: new Date().toISOString(),
          pagamento_aprovado_em: null,
          senha_id: null
        }])
    );

    // Retorna resposta
    return res.json({
      ...mpData,
      chave_pix: mpData.point_of_interaction?.transaction_data?.qr_code,
      qrcode: mpData.point_of_interaction?.transaction_data?.qr_code_base64,
      ticket_url: mpData.id
    });

  } catch (err) {
    next(err);
  }
});

// 3. Verificar status do pagamento
app.post('/api/captive-check/verify', async (req, res, next) => {
  try {
    const { mac, mikrotik_id, plano_id } = req.body;
    if (!mac || !mikrotik_id || !plano_id) {
      throw {
        message: 'mac, mikrotik_id e plano_id obrigatórios',
        code: 'VALIDATION_ERROR',
        details: 'Informe mac, mikrotik_id e plano_id',
        source: 'API'
      };
    }
    // Busca ou cria MAC
    let macObj = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .select('*')
        .eq('mac_address', mac)
        .single()
    );
    if (!macObj) {
      macObj = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('macs')
          .insert([{
            mac_address: mac,
            mikrotik_id,
            status: 'coletado',
            primeiro_acesso: new Date().toISOString()
          }])
          .select('*')
          .single()
      );
    }
    // Busca venda mais recente pendente ou aprovada
    const vendas = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('*')
        .eq('mac_id', macObj.id)
        .eq('plano_id', plano_id)
        .eq('mikrotik_id', mikrotik_id)
        .in('status', ['aguardando', 'pendente', 'aprovado'])
        .order('pagamento_gerado_em', { ascending: false })
        .limit(1)
    );
    const venda = vendas && vendas[0];
    // Buscar estatísticas do MAC
    const vendasMac = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('*')
        .eq('mac_id', macObj.id)
        .eq('status', 'aprovado')
    );
    const totalVendas = vendasMac ? vendasMac.length : 0;
    const totalGasto = vendasMac ? vendasMac.reduce((acc, v) => acc + Number(v.preco || 0), 0) : 0;
    const ultimoValor = vendasMac && vendasMac[0] ? vendasMac[0].preco : null;
    const ultimoPlano = vendasMac && vendasMac[0] ? vendasMac[0].plano_id : null;
    // Verifica se está dentro dos 10 minutos
    let statusPagamento = null;
    let pagamentoAprovadoEm = null;
    let senhaEntregue = null;
    let infoVenda = null;
    if (venda) {
      const agora = new Date();
      const geradoEm = new Date(venda.pagamento_gerado_em);
      const diffMin = (agora - geradoEm) / 60000;
      if (diffMin > 10 && venda.status !== 'aprovado') {
        // Zera campos de pagamento e permite novo Pix
        await handleSupabaseOperation(() =>
          supabaseAdmin
            .from('vendas')
            .update({
              chave_pix: null,
              qrcode: null,
              ticket_url: null,
              payment_id: null,
              status: 'expirado',
              pagamento_gerado_em: null
            })
            .eq('id', venda.id)
        );
        statusPagamento = 'expirado';
      } else {
        // Consulta status no Mercado Pago se não aprovado
        statusPagamento = venda.status;
        pagamentoAprovadoEm = venda.pagamento_aprovado_em;
        if (venda.payment_id && venda.status !== 'aprovado') {
          try {
            // Consulta status usando payment_id (que é o ticket_url)
            const paymentResult = await handleMercadoPagoFetch(`https://api.mercadopago.com/v1/payments/${venda.payment_id}`);
            statusPagamento = paymentResult.status;
            if (statusPagamento === 'approved' && venda.status !== 'aprovado') {
              pagamentoAprovadoEm = new Date().toISOString();
              // Buscar senha aleatória disponível para o plano
              const senha = await handleSupabaseOperation(() =>
                supabaseAdmin
                  .from('senhas')
                  .select('*')
                  .eq('plano_id', plano_id)
                  .eq('vendida', false)
                  .limit(1)
                  .single()
              );
              if (senha) {
                senhaEntregue = senha;
                // Marca senha como vendida
                await handleSupabaseOperation(() =>
                  supabaseAdmin
                    .from('senhas')
                    .update({ 
                      vendida: true,
                      vendida_em: new Date().toISOString()
                    })
                    .eq('id', senha.id)
                );
                // Buscar dono do mikrotik e porcentagem de lucro
                const mikrotikInfo = await handleSupabaseOperation(() =>
                  supabaseAdmin
                    .from('mikrotiks')
                    .select('cliente_id, profitpercentage')
                    .eq('id', mikrotik_id)
                    .single()
                );
                let porcentagemLucro = mikrotikInfo?.profitpercentage || 90;
                if (porcentagemLucro > 100) porcentagemLucro = 100;
                if (porcentagemLucro < 0) porcentagemLucro = 0;
                const comissaoDono = venda.preco * (porcentagemLucro / 100);
                const comissaoAdmin = venda.preco - comissaoDono;
                // Atualiza saldo do admin
                await supabaseAdmin.rpc('incrementar_saldo_admin', { valor: comissaoAdmin });
                // Atualiza saldo do dono do mikrotik
                if (mikrotikInfo && mikrotikInfo.cliente_id) {
                  await supabaseAdmin.rpc('incrementar_saldo_cliente', { cliente_id: mikrotikInfo.cliente_id, valor: comissaoDono });
                }
                // Atualiza venda
                await handleSupabaseOperation(() =>
                  supabaseAdmin
                    .from('vendas')
                    .update({
                      status: 'aprovado',
                      pagamento_aprovado_em: pagamentoAprovadoEm,
                      senha_id: senha.id
                    })
                    .eq('id', venda.id)
                );
                // Atualiza MAC: incrementa total_gasto e total_compras
                await handleSupabaseOperation(() =>
                  supabaseAdmin
                    .from('macs')
                    .update({
                      total_gasto: (macObj.total_gasto || 0) + Number(venda.preco || 0),
                      total_compras: (macObj.total_compras || 0) + 1
                    })
                    .eq('id', macObj.id)
                );
                console.log('[VENDA APROVADA] Saldo creditado: admin', comissaoAdmin, 'dono', comissaoDono, 'MAC atualizado:', macObj.mac_address);
              }
            }
          } catch (err) {
            // Se erro na consulta, mantém status anterior
          }
        }
        infoVenda = {
          status: statusPagamento,
          pagamento_gerado_em: venda.pagamento_gerado_em,
          pagamento_aprovado_em: pagamentoAprovadoEm,
          chave_pix: venda.chave_pix,
          qrcode: venda.qrcode,
          valor: venda.preco,
          ticket_url: venda.payment_id, // Retorna apenas o id do pagamento
          payment_id: venda.payment_id,
          senha: senhaEntregue
        };
      }
    }
    // Sempre retorna os dados do MAC e da venda mais recente
    return res.json({
      mac: macObj.mac_address,
      mikrotik_id: macObj.mikrotik_id,
      total_vendas: totalVendas,
      total_gasto: totalGasto,
      ultimo_valor: ultimoValor,
      ultimo_plano: ultimoPlano,
      status: statusPagamento || 'precisa_comprar',
      pagamento_pendente: infoVenda,
      ...(senhaEntregue && {
        username: senhaEntregue.usuario,
        password: senhaEntregue.senha,
        plano: venda.plano_id,
        duracao: 60,
        fim: new Date(new Date().getTime() + 60 * 60000).toISOString()
      })
    });
  } catch (err) {
    next(err);
  }
});

// 4. Endpoint de polling para pagamentos pendentes
app.post('/api/captive-check/poll-payment', async (req, res, next) => {
  try {
    const { payment_id } = req.body;
    
    if (!payment_id) {
      return res.status(400).json({
        error: 'payment_id é obrigatório',
        code: 'MISSING_PAYMENT_ID'
      });
    }

    console.log('[POLL-PAYMENT] Verificando pagamento:', payment_id);

    // Busca a venda pelo payment_id
    const venda = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('*, mac_id(*), plano_id(*), mikrotik_id(*)')
        .eq('payment_id', payment_id)
        .single()
    );

    if (!venda) {
      return res.status(404).json({
        error: 'Pagamento não encontrado',
        code: 'PAYMENT_NOT_FOUND'
      });
    }

    // Se já está aprovado, retorna os dados
    if (venda.status === 'aprovado' && venda.senha_id) {
      const senha = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('senhas')
          .select('*')
          .eq('id', venda.senha_id)
          .single()
      );

      return res.json({
        status: 'approved',
        payment_status: 'approved',
        username: senha?.usuario,
        password: senha?.senha,
        plano: venda.plano_id?.nome,
        duracao: venda.plano_id?.duracao || 60,
        message: 'Pagamento já foi processado'
      });
    }

    // Consulta o status no Mercado Pago
    try {
      const mpData = await handleMercadoPagoFetch(`https://api.mercadopago.com/v1/payments/${payment_id}`);
      
      console.log('[POLL-PAYMENT] Status Mercado Pago:', {
        id: mpData.id,
        status: mpData.status,
        status_detail: mpData.status_detail
      });

      // Se o pagamento foi aprovado no Mercado Pago
      if (mpData.status === 'approved') {
        console.log('[POLL-PAYMENT] Pagamento aprovado detectado, processando...');
        
        // Busca senha disponível
        const senha = await handleSupabaseOperation(() =>
          supabaseAdmin
            .from('senhas')
            .select('*')
            .eq('plano_id', venda.plano_id.id)
            .eq('vendida', false)
            .limit(1)
            .single()
        );

        if (!senha) {
          return res.status(500).json({
            error: 'Não há senhas disponíveis',
            code: 'NO_PASSWORD_AVAILABLE'
          });
        }

        // Marca senha como vendida
        await handleSupabaseOperation(() =>
          supabaseAdmin
            .from('senhas')
            .update({ 
              vendida: true,
              vendida_em: new Date().toISOString()
            })
            .eq('id', senha.id)
        );

        // Busca informações do mikrotik
        const mikrotikInfo = await handleSupabaseOperation(() =>
          supabaseAdmin
            .from('mikrotiks')
            .select('cliente_id, profitpercentage')
            .eq('id', venda.mikrotik_id.id)
            .single()
        );

        // Calcula comissões
        let porcentagemLucro = mikrotikInfo?.profitpercentage || 90;
        if (porcentagemLucro > 100) porcentagemLucro = 100;
        if (porcentagemLucro < 0) porcentagemLucro = 0;
        
        const comissaoDono = venda.preco * (porcentagemLucro / 100);
        const comissaoAdmin = venda.preco - comissaoDono;

        // Atualiza saldos
        await supabaseAdmin.rpc('incrementar_saldo_admin', { valor: comissaoAdmin });
        
        if (mikrotikInfo?.cliente_id) {
          await supabaseAdmin.rpc('incrementar_saldo_cliente', { 
            cliente_id: mikrotikInfo.cliente_id, 
            valor: comissaoDono 
          });
        }

        // Atualiza venda
        await handleSupabaseOperation(() =>
          supabaseAdmin
            .from('vendas')
            .update({
              status: 'aprovado',
              pagamento_aprovado_em: new Date().toISOString(),
              senha_id: senha.id
            })
            .eq('id', venda.id)
        );

        // Atualiza MAC
        await handleSupabaseOperation(() =>
          supabaseAdmin
            .from('macs')
            .update({
              total_gasto: (venda.mac_id.total_gasto || 0) + Number(venda.preco),
              total_compras: (venda.mac_id.total_compras || 0) + 1,
              ultimo_plano: venda.plano_id.nome,
              ultimo_valor: venda.preco,
              ultimo_acesso: new Date().toISOString(),
              status_pagamento: 'aprovado',
              pagamento_aprovado_em: new Date().toISOString()
            })
            .eq('id', venda.mac_id.id)
        );

        console.log('[POLL-PAYMENT] Pagamento processado com sucesso');

        return res.json({
          status: 'approved',
          payment_status: 'approved',
          username: senha.usuario,
          password: senha.senha,
          plano: venda.plano_id.nome,
          duracao: venda.plano_id.duracao || 60,
          message: 'Pagamento aprovado e processado com sucesso'
        });
      }

      // Retorna o status atual
      return res.json({
        status: 'pending',
        payment_status: mpData.status,
        status_detail: mpData.status_detail,
        message: 'Pagamento ainda não foi aprovado'
      });

    } catch (mpError) {
      console.error('[POLL-PAYMENT] Erro ao consultar Mercado Pago:', mpError);
      return res.status(500).json({
        error: 'Erro ao verificar status do pagamento',
        code: 'MERCADOPAGO_ERROR',
        details: mpError.message
      });
    }

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