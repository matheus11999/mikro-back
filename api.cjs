const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Configuração de timezone
const TIMEZONE = process.env.TIMEZONE || 'America/Sao_Paulo';

// Função utilitária para formatar data com timezone
function formatDateWithTimezone(date = new Date()) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

// Valida├º├úo de vari├íveis de ambiente (apenas aviso, n├úo para execu├º├úo)
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MERCADO_PAGO_ACCESS_TOKEN'
];

const missingEnvVars = [];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    missingEnvVars.push(envVar);
  }
}

if (missingEnvVars.length > 0) {
  console.warn(`Aviso: Vari├íveis de ambiente n├úo definidas: ${missingEnvVars.join(', ')}`);
  console.warn('A API pode n├úo funcionar corretamente sem essas vari├íveis.');
}

// Inicializa├º├úo dos clientes
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

// Função para verificar pagamentos pendentes no startup
async function verificarPagamentosPendentesStartup() {
  try {
    // Verifica se as variáveis de ambiente estão configuradas
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log('⚠️  Variáveis do Supabase não configuradas - pulando verificação de pagamentos pendentes');
      return;
    }
    
    if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
      console.log('⚠️  Token do Mercado Pago não configurado - pulando verificação de pagamentos pendentes');
      return;
    }
    
    console.log('\n🔍 VERIFICANDO PAGAMENTOS PENDENTES NO STARTUP...');
    console.log('='.repeat(60));
    
    // Buscar vendas com status pendente, processando, autorizado, criado ou aguardando das últimas 4 horas
    const statusPendentes = ['aguardando', 'pendente', 'processando', 'autorizado', 'criado'];
    const quatroHorasAtras = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(); // 4 horas atrás
    
    console.log(`📅 Buscando vendas pendentes desde: ${quatroHorasAtras}`);
    
    const vendasPendentes = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('*, mac_id(*), plano_id(*), mikrotik_id(*)')
        .in('status', statusPendentes)
        .not('payment_id', 'is', null)
        .gte('data', quatroHorasAtras)
        .order('data', { ascending: false })
        .limit(50) // Limita a 50 para não sobrecarregar
    );

    if (!vendasPendentes || vendasPendentes.length === 0) {
      console.log('✅ Nenhum pagamento pendente encontrado');
      console.log('='.repeat(60));
      return;
    }

    console.log(`📊 Encontradas ${vendasPendentes.length} vendas pendentes para verificar`);
    console.log('='.repeat(60));

    let processadas = 0;
    let aprovadas = 0;
    let rejeitadas = 0;
    let outros = 0;

    // Processa cada venda pendente
    for (const venda of vendasPendentes) {
      try {
        console.log(`\n🔄 Verificando payment_id: ${venda.payment_id} (Status atual: ${venda.status})`);
        
        // Consulta o status atual no Mercado Pago
        const mpData = await handleMercadoPagoFetch(`https://api.mercadopago.com/v1/payments/${venda.payment_id}`);
        
        console.log(`   📡 Status no MP: ${mpData.status} (${mpData.status_detail || 'N/A'})`);
        
        // Se o status mudou, processa a atualização
        if (mpData.status !== venda.status) {
          console.log(`   🔄 Status mudou de "${venda.status}" para "${mpData.status}" - processando...`);
          
          const agora = new Date().toISOString();
          let atualizacaoVenda = {
            ultima_atualizacao_status: agora
          };

          // Adiciona campos específicos se existirem
          try {
            atualizacaoVenda.mercado_pago_status = mpData.status;
            atualizacaoVenda.status_detail = mpData.status_detail || null;
          } catch (err) {
            console.log('   ⚠️  Campos novos não existem, continuando...');
          }

          if (mpData.status === 'approved') {
            // PAGAMENTO APROVADO
            console.log(`   ✅ APROVANDO pagamento ${venda.payment_id}...`);
            
            // Busca informações do mikrotik
            const mikrotikInfo = await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('mikrotiks')
                .select('cliente_id, profitpercentage')
                .eq('id', venda.mikrotik_id.id)
                .single()
            );
            
            // Calcula comissões
            let porcentagemAdmin = mikrotikInfo?.profitpercentage || 10;
            if (porcentagemAdmin > 100) porcentagemAdmin = 100;
            if (porcentagemAdmin < 0) porcentagemAdmin = 0;
            
            const comissaoAdmin = venda.preco * (porcentagemAdmin / 100);
            const comissaoDono = venda.preco - comissaoAdmin;
            
            // Atualiza saldos
            await supabaseAdmin.rpc('incrementar_saldo_admin', { valor: comissaoAdmin });
            
            if (mikrotikInfo?.cliente_id) {
              await supabaseAdmin.rpc('incrementar_saldo_cliente', { 
                cliente_id: mikrotikInfo.cliente_id, 
                valor: comissaoDono 
              });
            }
            
            // Atualiza venda
            atualizacaoVenda = {
              ...atualizacaoVenda,
              status: 'aprovado',
              pagamento_aprovado_em: agora,
              lucro: comissaoAdmin,
              valor: comissaoDono
            };
            
            // Atualiza MAC
            await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('macs')
                .update({
                  total_gasto: (venda.mac_id.total_gasto || 0) + Number(venda.preco),
                  total_compras: (venda.mac_id.total_compras || 0) + 1,
                  ultimo_plano: venda.plano_id.nome,
                  ultimo_valor: venda.preco,
                  ultimo_acesso: agora,
                  status_pagamento: 'aprovado',
                  pagamento_aprovado_em: agora
                })
                .eq('id', venda.mac_id.id)
            );
            
            console.log(`   💰 Saldos creditados - Admin: R$ ${comissaoAdmin.toFixed(2)}, Cliente: R$ ${comissaoDono.toFixed(2)}`);
            aprovadas++;

          } else if (mpData.status === 'rejected') {
            // PAGAMENTO REJEITADO
            console.log(`   ❌ REJEITANDO pagamento ${venda.payment_id}...`);
            
            atualizacaoVenda = {
              ...atualizacaoVenda,
              status: 'rejeitado'
            };

            try {
              atualizacaoVenda.pagamento_rejeitado_em = agora;
            } catch (err) {}

            await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('macs')
                .update({ status_pagamento: 'rejeitado' })
                .eq('id', venda.mac_id.id)
            );
            
            rejeitadas++;

          } else if (mpData.status === 'cancelled') {
            // PAGAMENTO CANCELADO
            console.log(`   🚫 CANCELANDO pagamento ${venda.payment_id}...`);
            
            atualizacaoVenda = {
              ...atualizacaoVenda,
              status: 'cancelado'
            };

            try {
              atualizacaoVenda.pagamento_cancelado_em = agora;
            } catch (err) {}

            await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('macs')
                .update({ status_pagamento: 'cancelado' })
                .eq('id', venda.mac_id.id)
            );
            
            outros++;

          } else if (mpData.status === 'expired') {
            // PAGAMENTO EXPIRADO
            console.log(`   ⏰ EXPIRANDO pagamento ${venda.payment_id}...`);
            
            atualizacaoVenda = {
              ...atualizacaoVenda,
              status: 'expirado'
            };

            try {
              atualizacaoVenda.pagamento_expirado_em = agora;
            } catch (err) {}
            
            outros++;

          } else {
            // OUTROS STATUS
            console.log(`   📝 Atualizando para status "${mpData.status}"`);
            atualizacaoVenda = {
              ...atualizacaoVenda,
              status: mpData.status
            };
            outros++;
          }

          // Atualiza a venda no banco
          await handleSupabaseOperation(() =>
            supabaseAdmin
              .from('vendas')
              .update(atualizacaoVenda)
              .eq('id', venda.id)
          );

          console.log(`   ✅ Venda atualizada com sucesso!`);
          processadas++;

        } else {
          console.log(`   ⭕ Status inalterado (${mpData.status})`);
        }

        // Pequena pausa entre consultas para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`   ❌ Erro ao verificar payment_id ${venda.payment_id}:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DA VERIFICAÇÃO:');
    console.log(`   🔄 Total verificadas: ${vendasPendentes.length}`);
    console.log(`   ✅ Processadas: ${processadas}`);
    console.log(`   💚 Aprovadas: ${aprovadas}`);
    console.log(`   ❌ Rejeitadas: ${rejeitadas}`);
    console.log(`   📝 Outros status: ${outros}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Erro na verificação de pagamentos pendentes:', error);
  }
}

// Configuração do Express
const app = express();
app.use(express.json());
app.use(cors());

// Middleware de log
const logRequest = (req, res, next) => {
  console.log(`[${formatDateWithTimezone()}] ${req.method} ${req.path}`, {
    body: req.body,
    query: req.query
  });
  next();
};

app.use(logRequest);

// Fun├º├úo utilit├íria para normalizar campos do MAC
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

// Fun├º├úo utilit├íria para validar MAC address
function isValidMac(mac) {
  return /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac);
}

// Fun├º├úo utilit├íria para tratar erros do Supabase
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
    if (err.code) throw err; // J├í ├® um erro formatado
    throw {
      message: 'Erro na opera├º├úo do banco de dados',
      code: 'SUPABASE_ERROR',
      details: err.message,
      source: 'Supabase'
    };
  }
}

// Middleware para validar token do MikroTik
async function validarTokenMikrotik(req, res, next) {
  try {
    const { mikrotik_id, token } = req.body;
    const mikrotikIdParam = req.params.mikrotik_id;
    
    // Usar mikrotik_id do body ou do parâmetro da URL
    const finalMikrotikId = mikrotik_id || mikrotikIdParam;
    
    if (!finalMikrotikId) {
      throw {
        message: 'mikrotik_id obrigatório',
        code: 'VALIDATION_ERROR',
        details: 'O ID do Mikrotik é obrigatório',
        source: 'API'
      };
    }

    if (!token) {
      throw {
        message: 'Token obrigatório',
        code: 'UNAUTHORIZED',
        details: 'Token de autenticação é obrigatório',
        source: 'API'
      };
    }

    console.log(`[${formatDateWithTimezone()}] [AUTH] Validando token para MikroTik:`, finalMikrotikId);

    // Verificar se o token corresponde ao MikroTik
    const mikrotikValidacao = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('mikrotiks')
        .select('id, nome, api_token, status')
        .eq('id', finalMikrotikId)
        .single()
    );

    if (!mikrotikValidacao) {
      throw {
        message: 'Mikrotik não encontrado',
        code: 'NOT_FOUND',
        details: `Mikrotik com ID ${finalMikrotikId} não foi encontrado`,
        source: 'API'
      };
    }

    // Verificar se o MikroTik está ativo
    if (mikrotikValidacao.status !== 'Ativo') {
      throw {
        message: 'Mikrotik inativo',
        code: 'FORBIDDEN',
        details: 'Este MikroTik está inativo e não pode fazer requisições',
        source: 'API'
      };
    }

    // Verificar se o token bate
    if (!mikrotikValidacao.api_token || mikrotikValidacao.api_token !== token) {
      throw {
        message: 'Token inválido',
        code: 'UNAUTHORIZED',
        details: 'Token não corresponde ao MikroTik informado',
        source: 'API'
      };
    }

    // Adicionar dados do MikroTik validado ao request
    req.mikrotik = mikrotikValidacao;
    req.mikrotik_id = finalMikrotikId;
    
    console.log(`[${formatDateWithTimezone()}] [AUTH] Token válido para:`, mikrotikValidacao.nome);
    next();

  } catch (err) {
    console.error(`[${formatDateWithTimezone()}] [AUTH] Erro na validação:`, err);
    next(err);
  }
}

// Função utilitária para tratar respostas do Mercado Pago via fetch
async function handleMercadoPagoFetch(url, options = {}) {
  try {
    console.log(`[MP FETCH] Fazendo requisição para: ${url}`);
    
    if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
      throw {
        message: 'Token do Mercado Pago não configurado',
        code: 'MERCADOPAGO_TOKEN_MISSING',
        details: 'MERCADO_PAGO_ACCESS_TOKEN não está definido',
        source: 'MercadoPago'
      };
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    console.log(`[MP FETCH] Response status: ${response.status} para ${url}`);

    if (!response.ok) {
      let errorData = {};
      try {
        errorData = await response.json();
      } catch (jsonErr) {
        errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
      }
      
      console.error(`[MP FETCH] Erro HTTP ${response.status}:`, errorData);
      
      throw {
        message: `Erro ${response.status} no Mercado Pago`,
        code: 'MERCADOPAGO_ERROR',
        details: errorData,
        status: response.status,
        source: 'MercadoPago'
      };
    }

    const data = await response.json();
    console.log(`[MP FETCH] Sucesso para ${url}`);
    return data;
    
  } catch (err) {
    if (err.code) {
      console.error(`[MP FETCH] Erro formatado:`, err);
      throw err; // Já é um erro formatado
    }
    
    console.error(`[MP FETCH] Erro de rede/timeout:`, err.message);
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

  // Define o status HTTP baseado no c├│digo de erro
  let status = 500;
  if (err.code === 'VALIDATION_ERROR') status = 400;
  if (err.code === 'NOT_FOUND') status = 404;
  if (err.code === 'UNAUTHORIZED') status = 401;
  if (err.code === 'FORBIDDEN') status = 403;

  res.status(status).json(errorResponse);
};

// Endpoint para teste de acessibilidade da API
app.get('/api/captive-check', (req, res) => {
  res.json({ status: 'ok', message: 'API est├í funcionando!' });
});



// Endpoint para listar planos dispon├¡veis
app.post('/api/captive-check/planos', async (req, res, next) => {
  try {
    const { mikrotik_id } = req.body;
    
    if (!mikrotik_id) {
      throw {
        message: 'mikrotik_id obrigat├│rio',
        code: 'VALIDATION_ERROR',
        details: 'O ID do Mikrotik ├® obrigat├│rio',
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
        message: 'Nenhum plano dispon├¡vel para este mikrotik'
      });
    }

    // Para cada plano, verificar se h├í senhas dispon├¡veis
    const planosComDisponibilidade = await Promise.all(
      planos.map(async (plano) => {
        try {
          const senhasDisponiveis = await handleSupabaseOperation(() =>
            supabaseAdmin
              .from('senhas')
              .select('id')
              .eq('plano_id', plano.id)
              .eq('vendida', false)
          );

          const count = senhasDisponiveis ? senhasDisponiveis.length : 0;
          
          console.log(`[PLANOS] Plano ${plano.nome}: ${count} senhas dispon├¡veis`);

          return {
            ...plano,
            senhas_disponiveis: count,
            disponivel: count > 0
          };
        } catch (error) {
          console.error(`[PLANOS] Erro ao verificar senhas para plano ${plano.id}:`, error);
          // Em caso de erro, assume que est├í dispon├¡vel
          return {
            ...plano,
            senhas_disponiveis: 0,
            disponivel: true // Assume dispon├¡vel em caso de erro
          };
        }
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
        message: 'MAC inv├ílido',
        code: 'VALIDATION_ERROR',
        details: 'Formato esperado: XX:XX:XX:XX:XX:XX',
        source: 'API'
      };
    }
    if (!mikrotik_id) {
      throw {
        message: 'mikrotik_id obrigat├│rio',
        code: 'VALIDATION_ERROR',
        details: 'O ID do Mikrotik ├® obrigat├│rio',
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
    // Atualiza mikrotik_id se necess├írio
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
    let vendaPendente = vendaPendenteArr && vendaPendenteArr[0];
    
    // Verifica se a venda pendente est├í expirada (mais de 10 minutos)
    if (vendaPendente && vendaPendente.pagamento_gerado_em) {
      const geradoEm = new Date(vendaPendente.pagamento_gerado_em);
      const agora = new Date();
      const diffMinutos = (agora - geradoEm) / 60000;
      
      if (diffMinutos > 10) {
        console.log('[STATUS] Pagamento expirado, deletando:', vendaPendente.id);
        
        // Deleta a venda expirada
        await handleSupabaseOperation(() =>
          supabaseAdmin
            .from('vendas')
            .delete()
            .eq('id', vendaPendente.id)
        );
        
        // Limpa a refer├¬ncia
        vendaPendente = null;
      }
    }
    // Estat├¡sticas do MAC
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
          
          // Se o pagamento foi aprovado no Mercado Pago mas ainda n├úo foi processado no sistema
          if (statusPagamento === 'approved' && vendaPendente.status !== 'aprovado') {
            console.log('[STATUS] Pagamento aprovado detectado, processando...');
            pagamentoAprovadoEm = new Date().toISOString();
            
            // Buscar senha aleat├│ria dispon├¡vel para o plano
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
              
              let porcentagemAdmin = mikrotikInfo?.profitpercentage || 10;
              if (porcentagemAdmin > 100) porcentagemAdmin = 100;
              if (porcentagemAdmin < 0) porcentagemAdmin = 0;
              
              const comissaoAdmin = vendaPendente.preco * (porcentagemAdmin / 100);
              const comissaoDono = vendaPendente.preco - comissaoAdmin;
              
              // Atualiza saldo do admin
              await supabaseAdmin.rpc('incrementar_saldo_admin', { valor: comissaoAdmin });
              
              // Atualiza saldo do dono do mikrotik
              if (mikrotikInfo && mikrotikInfo.cliente_id) {
                await supabaseAdmin.rpc('incrementar_saldo_cliente', { 
                  cliente_id: mikrotikInfo.cliente_id, 
                  valor: comissaoDono 
                });
              }
              
              // Atualiza venda - valor agora representa a parte do cliente
              await handleSupabaseOperation(() =>
                supabaseAdmin
                  .from('vendas')
                  .update({
                    status: 'aprovado',
                    pagamento_aprovado_em: pagamentoAprovadoEm,
                    senha_id: senha.id,
                    lucro: comissaoAdmin,
                    valor: comissaoDono
                  })
                  .eq('id', vendaPendente.id)
              );
              
              // Busca informa├º├Áes do plano para pegar a dura├º├úo
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
        // Se erro, mant├®m status anterior
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
      
      // Se ainda est├í pendente, retorna os dados do pagamento pendente
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
    // Se houver venda aprovada v├ílida (senha ativa)
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
    // Se n├úo houver venda, retorna precisa_comprar e estat├ísticas
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

    // Valida├º├úo de campos
    const requiredFields = { mac, plano_id, mikrotik_id, preco };
    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value)
      .map(([field]) => field);

    if (missingFields.length > 0) {
      throw {
        message: 'Campos obrigat├│rios ausentes',
        code: 'VALIDATION_ERROR',
        details: `Campos ausentes: ${missingFields.join(', ')}`,
        source: 'API'
      };
    }

    // Valida├º├úo extra para preco
    let precoNumerico = preco;
    console.log('DEBUG preco recebido:', preco, '-> precoNumerico:', precoNumerico, 'Tipo:', typeof precoNumerico);
    if (precoNumerico === null || isNaN(precoNumerico) || precoNumerico <= 0) {
      console.error('Erro: preco inv├ílido recebido:', preco, 'Tipo:', typeof preco);
      throw {
        message: 'Pre├ºo inv├ílido para o pagamento Pix',
        code: 'VALIDATION_ERROR',
        details: `O valor do pagamento deve ser um n├║mero maior que zero. Valor recebido: ${preco} (tipo: ${typeof preco})`,
        source: 'API'
      };
    }

    if (!isValidMac(mac)) {
      throw {
        message: 'MAC inv├ílido',
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
    // Verifica se j├í existe venda pendente para este MAC/plano/mikrotik
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
        error: 'J├í existe um pagamento pendente para este MAC/plano/mikrotik.',
        code: 'PENDING_PAYMENT_EXISTS'
      });
    }
    // Verificação de senhas removida - permite gerar PIX sem verificar senhas disponíveis

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
        message: 'Plano n├úo encontrado',
        code: 'NOT_FOUND',
        details: `Plano com ID ${plano_id} n├úo existe`,
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
        message: 'Mikrotik n├úo encontrado',
        code: 'NOT_FOUND',
        details: `Mikrotik com ID ${mikrotik_id} n├úo existe`,
        source: 'API'
      };
    }

    // Monta o corpo da requisi├º├úo
    const paymentData = {
      transaction_amount: precoNumerico,
      description: descricao || plano.nome,
      payment_method_id: 'pix',
      notification_url: `${process.env.API_DOMAIN || 'https://api.lucro.top'}/api/webhook/mercadopago`, // WEBHOOK URL DINÂMICO!
      payer: payer || {
        email: 'comprador@email.com',
        first_name: 'Joao',
        last_name: 'Silva',
        identification: { type: 'CPF', number: '19119119100' },
        address: {
          zip_code: '06233200',
          street_name: 'Av. das Na├º├Áes Unidas',
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
      console.error('Erro: transaction_amount inv├ílido antes de chamar Mercado Pago:', paymentData);
      return res.status(400).json({
        error: 'transaction_amount inv├ílido antes de chamar Mercado Pago',
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
        message: 'mac, mikrotik_id e plano_id obrigat├│rios',
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
    // Buscar estat├¡sticas do MAC
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
    // Verifica se est├í dentro dos 10 minutos
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
        // Consulta status no Mercado Pago se n├úo aprovado
        statusPagamento = venda.status;
        pagamentoAprovadoEm = venda.pagamento_aprovado_em;
        if (venda.payment_id && venda.status !== 'aprovado') {
          try {
            // Consulta status usando payment_id (que ├® o ticket_url)
            const paymentResult = await handleMercadoPagoFetch(`https://api.mercadopago.com/v1/payments/${venda.payment_id}`);
            statusPagamento = paymentResult.status;
            if (statusPagamento === 'approved' && venda.status !== 'aprovado') {
              pagamentoAprovadoEm = new Date().toISOString();
              // Buscar senha aleat├│ria dispon├¡vel para o plano
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
                let porcentagemAdmin = mikrotikInfo?.profitpercentage || 10;
                if (porcentagemAdmin > 100) porcentagemAdmin = 100;
                if (porcentagemAdmin < 0) porcentagemAdmin = 0;
                const comissaoAdmin = venda.preco * (porcentagemAdmin / 100);
                const comissaoDono = venda.preco - comissaoAdmin;
                // Atualiza saldo do admin
                await supabaseAdmin.rpc('incrementar_saldo_admin', { valor: comissaoAdmin });
                // Atualiza saldo do dono do mikrotik
                if (mikrotikInfo && mikrotikInfo.cliente_id) {
                  await supabaseAdmin.rpc('incrementar_saldo_cliente', { cliente_id: mikrotikInfo.cliente_id, valor: comissaoDono });
                }
                // Atualiza venda - valor agora representa a parte do cliente
                await handleSupabaseOperation(() =>
                  supabaseAdmin
                    .from('vendas')
                    .update({
                      status: 'aprovado',
                      pagamento_aprovado_em: pagamentoAprovadoEm,
                      senha_id: senha.id,
                      lucro: comissaoAdmin,
                      valor: comissaoDono
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
            // Se erro na consulta, mant├®m status anterior
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

// Endpoint simples para verificar status de pagamento (apenas consulta)
app.get('/api/captive-check/payment-status/:payment_id', async (req, res, next) => {
  try {
    const { payment_id } = req.params;
    
    if (!payment_id) {
      return res.status(400).json({
        error: 'payment_id ├® obrigat├│rio',
        code: 'MISSING_PAYMENT_ID'
      });
    }

    console.log('[PAYMENT-STATUS] Consultando status:', payment_id);

    // Busca a venda pelo payment_id
    const venda = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('*, senha_id(*), plano_id(*)')
        .eq('payment_id', payment_id)
        .single()
    );

    if (!venda) {
      return res.status(404).json({
        error: 'Pagamento n├úo encontrado',
        code: 'PAYMENT_NOT_FOUND'
      });
    }

    // Se j├í est├í aprovado, retorna os dados
    if (venda.status === 'aprovado' && venda.senha_id) {
      return res.json({
        status: 'approved',
        payment_status: 'approved',
        username: venda.senha_id?.usuario,
        password: venda.senha_id?.senha,
        plano: venda.plano_id?.nome,
        duracao: venda.plano_id?.duracao || 60,
        message: 'Pagamento aprovado - credenciais dispon├¡veis'
      });
    }

    // Retorna status pendente
    return res.json({
      status: 'pending',
      payment_status: venda.status || 'pending',
      message: 'Pagamento ainda n├úo foi aprovado'
    });

  } catch (err) {
    next(err);
  }
});

// Webhook do Mercado Pago para receber notificações de pagamento (VERSÃO MELHORADA)
app.post('/api/webhook/mercadopago', async (req, res, next) => {
  try {
    console.log('[WEBHOOK MP] Notificação recebida:', {
      headers: req.headers,
      body: req.body,
      query: req.query
    });
    
    // Responde imediatamente ao Mercado Pago
    res.status(200).send('OK');
    
    // Processa a notificação de forma assíncrona
    // Mercado Pago pode enviar em diferentes formatos
    const { id, topic, type, action, data, resource } = req.body;
    
    // Também verifica query params (Mercado Pago às vezes envia assim)
    const queryId = req.query.id || req.query['data.id'];
    const queryTopic = req.query.topic;
    
    // Determina o payment ID e topic - prioriza data.id sobre id para evitar confusão
    const paymentTopic = topic || type || queryTopic;
    const paymentId = data?.id || resource || queryId || id;
    
    console.log('[WEBHOOK MP] Processando:', { paymentTopic, paymentId, originalBody: req.body });
    
    // Verifica se é uma notificação de pagamento
    if ((paymentTopic === 'payment' || paymentTopic === 'merchant_order') && paymentId) {
      
      console.log(`[WEBHOOK MP] Processando pagamento ${paymentId}...`);
      
      // Aguarda um pouco para garantir que o pagamento esteja atualizado no MP
      setTimeout(async () => {
        try {
          console.log(`[WEBHOOK MP] Consultando Mercado Pago para payment ${paymentId}...`);
          
          // Consulta detalhes do pagamento no Mercado Pago
          const mpData = await handleMercadoPagoFetch(`https://api.mercadopago.com/v1/payments/${paymentId}`);
          
          console.log(`[WEBHOOK MP] Resposta do MP recebida para ${paymentId}:`, {
            status: mpData.status,
            status_detail: mpData.status_detail,
            id: mpData.id
          });
          
          console.log(`[WEBHOOK MP] Status do pagamento ${paymentId}: ${mpData.status} - Detail: ${mpData.status_detail || 'N/A'}`);
          
          // Busca a venda correspondente
          const venda = await handleSupabaseOperation(() =>
            supabaseAdmin
              .from('vendas')
              .select('*, mac_id(*), plano_id(*), mikrotik_id(*)')
              .eq('payment_id', paymentId)
              .single()
          );
          
          if (!venda) {
            console.error(`[WEBHOOK MP] Venda não encontrada para payment_id ${paymentId}`);
            return;
          }

          const statusAnterior = venda.status;
          const agora = new Date().toISOString();
          let atualizacaoVenda = {
            ultima_atualizacao_status: agora
          };

          // Verifica se os novos campos existem antes de usar
          try {
            await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('vendas')
                .select('mercado_pago_status, status_detail')
                .eq('id', venda.id)
                .limit(1)
            );
            // Se chegou aqui, os campos existem
            atualizacaoVenda.mercado_pago_status = mpData.status;
            atualizacaoVenda.status_detail = mpData.status_detail || null;
          } catch (err) {
            console.log('[WEBHOOK MP] Campos novos não existem ainda, continuando sem eles...');
          }

          // Processa diferentes status do Mercado Pago
          if (mpData.status === 'approved') {
            // PAGAMENTO APROVADO
            if (venda.status === 'aprovado') {
              console.log(`[WEBHOOK MP] Pagamento ${paymentId} já foi processado anteriormente`);
              return;
            }
            
            console.log(`[WEBHOOK MP] Processando aprovação do pagamento ${paymentId}...`);
            
            // Busca informações do mikrotik
            const mikrotikInfo = await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('mikrotiks')
                .select('cliente_id, profitpercentage')
                .eq('id', venda.mikrotik_id.id)
                .single()
            );
            
            // Calcula comissões
            let porcentagemAdmin = mikrotikInfo?.profitpercentage || 10;
            if (porcentagemAdmin > 100) porcentagemAdmin = 100;
            if (porcentagemAdmin < 0) porcentagemAdmin = 0;
            
            const comissaoAdmin = venda.preco * (porcentagemAdmin / 100);
            const comissaoDono = venda.preco - comissaoAdmin;
            
            // Atualiza saldos
            await supabaseAdmin.rpc('incrementar_saldo_admin', { valor: comissaoAdmin });
            
            if (mikrotikInfo?.cliente_id) {
              await supabaseAdmin.rpc('incrementar_saldo_cliente', { 
                cliente_id: mikrotikInfo.cliente_id, 
                valor: comissaoDono 
              });
            }
            
            // Sistema SEM SENHAS - atualiza diretamente o status
            atualizacaoVenda = {
              ...atualizacaoVenda,
              status: 'aprovado',
              pagamento_aprovado_em: agora,
              lucro: comissaoAdmin,
              valor: comissaoDono,
              senha_id: null // Sistema sem senhas
            };
            
            // Atualiza MAC com pagamento aprovado (MAS NÃO conecta automaticamente)
            await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('macs')
                .update({
                  total_gasto: (venda.mac_id.total_gasto || 0) + Number(venda.preco),
                  total_compras: (venda.mac_id.total_compras || 0) + 1,
                  ultimo_plano: venda.plano_id.nome,
                  ultimo_valor: venda.preco,
                  status_pagamento: 'aprovado',
                  pagamento_aprovado_em: agora
                  // REMOVIDO: status: 'conectado' - MAC só conecta quando cliente realmente se conectar
                  // REMOVIDO: ultimo_acesso - só atualiza quando cliente se conectar de verdade
                })
                .eq('id', venda.mac_id.id)
            );
            
            console.log(`[WEBHOOK MP] Pagamento ${paymentId} APROVADO e processado com sucesso!`);
            console.log(`[WEBHOOK MP] Saldos creditados - Admin: R$ ${comissaoAdmin.toFixed(2)}, Cliente: R$ ${comissaoDono.toFixed(2)}`);

          } else if (mpData.status === 'rejected') {
            // PAGAMENTO REJEITADO
            console.log(`[WEBHOOK MP] Pagamento ${paymentId} foi REJEITADO - Motivo: ${mpData.status_detail}`);
            
            atualizacaoVenda = {
              ...atualizacaoVenda,
              status: 'rejeitado'
            };

            // Adiciona campo específico se existir
            try {
              atualizacaoVenda.pagamento_rejeitado_em = agora;
            } catch (err) {
              console.log('[WEBHOOK MP] Campo pagamento_rejeitado_em não existe');
            }

            // Atualiza MAC com rejeição
            await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('macs')
                .update({
                  status_pagamento: 'rejeitado'
                })
                .eq('id', venda.mac_id.id)
            );

          } else if (mpData.status === 'cancelled') {
            // PAGAMENTO CANCELADO
            console.log(`[WEBHOOK MP] Pagamento ${paymentId} foi CANCELADO`);
            
            atualizacaoVenda = {
              ...atualizacaoVenda,
              status: 'cancelado'
            };

            // Adiciona campo específico se existir
            try {
              atualizacaoVenda.pagamento_cancelado_em = agora;
            } catch (err) {
              console.log('[WEBHOOK MP] Campo pagamento_cancelado_em não existe');
            }

            // Atualiza MAC com cancelamento
            await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('macs')
                .update({
                  status_pagamento: 'cancelado'
                })
                .eq('id', venda.mac_id.id)
            );

          } else if (mpData.status === 'expired') {
            // PAGAMENTO EXPIRADO
            console.log(`[WEBHOOK MP] Pagamento ${paymentId} EXPIROU`);
            
            atualizacaoVenda = {
              ...atualizacaoVenda,
              status: 'expirado'
            };

            // Adiciona campo específico se existir
            try {
              atualizacaoVenda.pagamento_expirado_em = agora;
            } catch (err) {
              console.log('[WEBHOOK MP] Campo pagamento_expirado_em não existe');
            }

          } else if (mpData.status === 'refunded') {
            // PAGAMENTO REEMBOLSADO
            console.log(`[WEBHOOK MP] Pagamento ${paymentId} foi REEMBOLSADO`);
            
            // Se a venda estava aprovada, reverter saldos
            if (venda.status === 'aprovado') {
              try {
                // Reverter saldos manualmente se a função não existir
                if (venda.lucro && venda.lucro > 0) {
                  await handleSupabaseOperation(() =>
                    supabaseAdmin.rpc('incrementar_saldo_admin', { valor: -venda.lucro })
                  );
                }
                
                if (venda.valor && venda.valor > 0) {
                  const mikrotikInfo = await handleSupabaseOperation(() =>
                    supabaseAdmin
                      .from('mikrotiks')
                      .select('cliente_id')
                      .eq('id', venda.mikrotik_id)
                      .single()
                  );
                  
                  if (mikrotikInfo?.cliente_id) {
                    await handleSupabaseOperation(() =>
                      supabaseAdmin.rpc('incrementar_saldo_cliente', { 
                        cliente_id: mikrotikInfo.cliente_id, 
                        valor: -venda.valor 
                      })
                    );
                  }
                }
                
                // Sistema sem senhas - não há necessidade de liberar senhas
                
                console.log(`[WEBHOOK MP] Saldos revertidos para pagamento ${paymentId}`);
              } catch (err) {
                console.error(`[WEBHOOK MP] Erro ao reverter saldos:`, err);
              }
            }
            
            atualizacaoVenda = {
              ...atualizacaoVenda,
              status: 'reembolsado'
            };

            // Adiciona campo específico se existir
            try {
              atualizacaoVenda.pagamento_reembolsado_em = agora;
            } catch (err) {
              console.log('[WEBHOOK MP] Campo pagamento_reembolsado_em não existe');
            }

          } else if (mpData.status === 'charged_back') {
            // CHARGEBACK
            console.log(`[WEBHOOK MP] Chargeback detectado para pagamento ${paymentId}`);
            
            // Se a venda estava aprovada, reverter saldos
            if (venda.status === 'aprovado') {
              try {
                // Reverter saldos manualmente
                if (venda.lucro && venda.lucro > 0) {
                  await handleSupabaseOperation(() =>
                    supabaseAdmin.rpc('incrementar_saldo_admin', { valor: -venda.lucro })
                  );
                }
                
                if (venda.valor && venda.valor > 0) {
                  const mikrotikInfo = await handleSupabaseOperation(() =>
                    supabaseAdmin
                      .from('mikrotiks')
                      .select('cliente_id')
                      .eq('id', venda.mikrotik_id)
                      .single()
                  );
                  
                  if (mikrotikInfo?.cliente_id) {
                    await handleSupabaseOperation(() =>
                      supabaseAdmin.rpc('incrementar_saldo_cliente', { 
                        cliente_id: mikrotikInfo.cliente_id, 
                        valor: -venda.valor 
                      })
                    );
                  }
                }
                
                console.log(`[WEBHOOK MP] Saldos revertidos devido a chargeback ${paymentId}`);
              } catch (err) {
                console.error(`[WEBHOOK MP] Erro ao reverter saldos por chargeback:`, err);
              }
            }
            
            atualizacaoVenda = {
              ...atualizacaoVenda,
              status: 'chargeback'
            };

            // Adiciona campo específico se existir
            try {
              atualizacaoVenda.chargeback_em = agora;
            } catch (err) {
              console.log('[WEBHOOK MP] Campo chargeback_em não existe');
            }

          } else if (mpData.status === 'pending' || mpData.status === 'in_process') {
            // PAGAMENTO PENDENTE OU EM PROCESSAMENTO
            console.log(`[WEBHOOK MP] Pagamento ${paymentId} está ${mpData.status === 'pending' ? 'PENDENTE' : 'EM PROCESSAMENTO'}`);
            
            atualizacaoVenda = {
              ...atualizacaoVenda,
              status: mpData.status === 'pending' ? 'pendente' : 'processando'
            };

          } else if (mpData.status === 'authorized') {
            // PAGAMENTO AUTORIZADO (aguardando captura)
            console.log(`[WEBHOOK MP] Pagamento ${paymentId} foi AUTORIZADO (aguardando captura)`);
            
            atualizacaoVenda = {
              ...atualizacaoVenda,
              status: 'autorizado'
            };

          } else {
            // STATUS DESCONHECIDO
            console.log(`[WEBHOOK MP] Status desconhecido para pagamento ${paymentId}: ${mpData.status}`);
            
            atualizacaoVenda = {
              ...atualizacaoVenda,
              status: mpData.status
            };
          }

          // Atualiza a venda com o novo status
          await handleSupabaseOperation(() =>
            supabaseAdmin
              .from('vendas')
              .update(atualizacaoVenda)
              .eq('id', venda.id)
          );

          // Registra a mudança no log (se a função existir)
          try {
            await handleSupabaseOperation(() =>
              supabaseAdmin.rpc('registrar_mudanca_status', {
                p_venda_id: venda.id,
                p_status_anterior: statusAnterior,
                p_status_novo: atualizacaoVenda.status,
                p_mercado_pago_status: mpData.status,
                p_status_detail: mpData.status_detail,
                p_webhook_data: req.body,
                p_observacoes: `Webhook processado em ${agora}`
              })
            );
          } catch (logErr) {
            console.log('[WEBHOOK MP] Log não registrado (função pode não existir):', logErr.message);
          }

          console.log(`[WEBHOOK MP] Status atualizado: ${statusAnterior} → ${atualizacaoVenda.status} para pagamento ${paymentId}`);
        
        } catch (error) {
          console.error('[WEBHOOK MP] Erro ao processar pagamento:', {
            paymentId,
            error: error.message,
            code: error.code,
            details: error.details,
            stack: error.stack
          });
          
          // Se for erro de comunicação com MP, tenta novamente em 10 segundos
          if (error.code === 'MERCADOPAGO_NETWORK_ERROR' || error.code === 'MERCADOPAGO_ERROR') {
            console.log(`[WEBHOOK MP] Tentando novamente em 10 segundos para payment ${paymentId}...`);
            setTimeout(async () => {
              try {
                console.log(`[WEBHOOK MP] RETRY - Consultando Mercado Pago para payment ${paymentId}...`);
                const mpData = await handleMercadoPagoFetch(`https://api.mercadopago.com/v1/payments/${paymentId}`);
                console.log(`[WEBHOOK MP] RETRY - Sucesso na consulta do payment ${paymentId}`);
                // Aqui poderia reprocessar, mas por simplicidade só logamos
              } catch (retryError) {
                console.error(`[WEBHOOK MP] RETRY FAILED para payment ${paymentId}:`, retryError.message);
              }
            }, 10000);
          }
        }
              }, 2000); // Aguarda 2 segundos antes de processar
    } else {
      console.log('[WEBHOOK MP] Notificação ignorada:', { topic: paymentTopic, id: paymentId });
    }
    
  } catch (error) {
    console.error('[WEBHOOK MP] Erro no webhook:', error);
    // Mesmo com erro, retorna 200 para o MP não reenviar
    if (!res.headersSent) {
      res.status(200).send('OK');
    }
  }
});

// Endpoint GET para o webhook (alguns sistemas fazem verificação GET primeiro)
app.get('/api/webhook/mercadopago', (req, res) => {
  console.log('[WEBHOOK MP] Verificação GET recebida:', req.query);
  res.status(200).send('Webhook do Mercado Pago está ativo');
});

// Endpoint de teste para simular notificação do Mercado Pago
app.post('/api/webhook/mercadopago/test', async (req, res) => {
  const { payment_id } = req.body;
  
  if (!payment_id) {
    return res.status(400).json({ error: 'payment_id é obrigatório' });
  }
  
  console.log('[WEBHOOK TEST] Simulando notificação para payment_id:', payment_id);
  
  // Simula notificação do Mercado Pago
  const simulatedNotification = {
    id: payment_id,
    topic: 'payment',
    action: 'payment.updated',
    date_created: new Date().toISOString()
  };
  
  // Envia para o webhook real
  try {
    const webhookUrl = `${process.env.API_DOMAIN || 'http://localhost:3000'}/api/webhook/mercadopago`;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(simulatedNotification)
    });
    
    res.json({
      message: 'Notificação simulada enviada',
      notification: simulatedNotification,
      webhookResponse: response.status
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao simular notificação', details: error.message });
  }
});

// Endpoint para listar MACs que compraram senhas nas últimas 4 horas e estão DESCONECTADOS
app.post('/api/recent-sales', validarTokenMikrotik, async (req, res, next) => {
  try {
    const mikrotik_id = req.mikrotik_id; // Já validado pelo middleware
    
    console.log(`[${formatDateWithTimezone()}] [RECENT-SALES] Buscando vendas NÃO autenticadas das últimas 4 horas para mikrotik:`, req.mikrotik.nome);

    // Data das últimas 4 horas
    const agora = new Date();
    const quatroHorasAtras = new Date(agora.getTime() - 4 * 60 * 60 * 1000); // 4 horas atrás

    // Buscar vendas aprovadas das últimas 4 horas que NÃO foram autenticadas ainda
    let vendas;
    try {
      vendas = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('vendas')
          .select(`
            *,
            mac_id (mac_address, status),
            plano_id (nome, duracao)
          `)
          .eq('mikrotik_id', mikrotik_id)
          .eq('status', 'aprovado')
          .eq('autenticado', false) // Apenas vendas NÃO autenticadas
          .gte('pagamento_aprovado_em', quatroHorasAtras.toISOString())
          .order('pagamento_aprovado_em', { ascending: false })
      );
    } catch (err) {
      // Se a coluna 'autenticado' não existir ainda, buscar sem esse filtro
      console.log('[RECENT-SALES] Coluna autenticado não existe ainda, buscando sem filtro...');
      vendas = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('vendas')
          .select(`
            *,
            mac_id (mac_address, status),
            plano_id (nome, duracao)
          `)
          .eq('mikrotik_id', mikrotik_id)
          .eq('status', 'aprovado')
          .gte('pagamento_aprovado_em', quatroHorasAtras.toISOString())
          .order('pagamento_aprovado_em', { ascending: false })
      );
    }

    if (!vendas || vendas.length === 0) {
      console.log('[RECENT-SALES] Nenhuma venda NÃO autenticada encontrada nas últimas 4 horas');
      return res.send('N/A');
    }

    // Filtrar apenas MACs que estão DESCONECTADOS
    const vendasDesconectadas = vendas.filter(venda => {
      const statusMac = venda.mac_id?.status;
      const isDesconectado = !statusMac || statusMac === 'coletado' || statusMac === 'desconectado' || statusMac === 'precisa_comprar';
      
      if (isDesconectado) {
        console.log(`[RECENT-SALES] MAC ${venda.mac_id?.mac_address} está desconectado e NÃO autenticado (status: ${statusMac}) - incluindo na lista`);
      } else {
        console.log(`[RECENT-SALES] MAC ${venda.mac_id?.mac_address} está conectado (status: ${statusMac}) - ignorando`);
      }
      
      return isDesconectado;
    });

    if (vendasDesconectadas.length === 0) {
      console.log('[RECENT-SALES] Todas as vendas são de MACs já conectados');
      return res.send('N/A');
    }

    // Formatar dados no formato solicitado: mac-minutos
    const vendasFormatadas = vendasDesconectadas.map(venda => {
      const mac = venda.mac_id?.mac_address || 'N/A';
      const minutos = venda.plano_id?.duracao || 0;
      
      return `${mac}-${minutos}`;
    });

    console.log(`[RECENT-SALES] Encontradas ${vendas.length} vendas NÃO autenticadas, ${vendasDesconectadas.length} de MACs desconectados`);

    // Retornar apenas texto puro, uma venda por linha
    res.set('Content-Type', 'text/plain');
    return res.send(vendasFormatadas.join('\n'));

  } catch (err) {
    next(err);
  }
});

// Rota para servir templates HTML
app.get('/api/templates/:templateId/:filename', async (req, res, next) => {
  try {
    const { templateId, filename } = req.params;
    
    // Validar parâmetros
    if (!templateId || !filename) {
      return res.status(400).json({
        error: 'templateId e filename obrigatórios',
        code: 'VALIDATION_ERROR',
        details: 'Informe o ID do template e o nome do arquivo'
      });
    }

    // Validar templateId é numérico
    if (!/^\d+$/.test(templateId)) {
      return res.status(400).json({
        error: 'templateId deve ser numérico',
        code: 'INVALID_TEMPLATE_ID',
        details: 'O ID do template deve conter apenas números'
      });
    }

    // Validar filename termina com .html
    if (!filename.endsWith('.html')) {
      return res.status(400).json({
        error: 'Arquivo deve ser HTML',
        code: 'INVALID_FILE_TYPE',
        details: 'Apenas arquivos .html são permitidos'
      });
    }

    // Construir caminho do arquivo
    const templatePath = path.join(__dirname, 'templates', templateId, filename);
    
    // Verificar se o arquivo existe
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({
        error: 'Template não encontrado',
        code: 'TEMPLATE_NOT_FOUND',
        details: `Template ${templateId}/${filename} não existe`,
        available_templates: getAvailableTemplates()
      });
    }

    console.log(`[TEMPLATES] Servindo: ${templateId}/${filename}`);
    
    // Servir o arquivo HTML
    res.sendFile(templatePath);

  } catch (err) {
    next(err);
  }
});

// Endpoint para listar templates disponíveis
app.get('/api/templates', async (req, res, next) => {
  try {
    const templates = getAvailableTemplates();
    
    return res.json({
      message: 'Templates disponíveis',
      templates: templates,
      total: templates.length,
      usage: 'GET /api/templates/{templateId}/{filename}.html'
    });
    
  } catch (err) {
    next(err);
  }
});

// Função para listar templates disponíveis
function getAvailableTemplates() {
  const templatesDir = path.join(__dirname, 'templates');
  const templates = [];
  
  try {
    if (fs.existsSync(templatesDir)) {
      const templateFolders = fs.readdirSync(templatesDir);
      
      templateFolders.forEach(folderId => {
        const folderPath = path.join(templatesDir, folderId);
        if (fs.statSync(folderPath).isDirectory()) {
          const files = fs.readdirSync(folderPath)
            .filter(file => file.endsWith('.html'));
          
          if (files.length > 0) {
            templates.push({
              id: folderId,
              name: `Template ${folderId}`,
              files: files,
              urls: files.map(file => `/api/templates/${folderId}/${file}`)
            });
          }
        }
      });
    }
  } catch (error) {
    console.error('[TEMPLATES] Erro ao listar templates:', error);
  }
  
  return templates;
}

// Endpoint para receber notificações de autenticação do Mikrotik
app.post('/api/mikrotik/auth-notification', validarTokenMikrotik, async (req, res, next) => {
  try {
    const { mac_address, action, usuario, ip_address } = req.body;
    const mikrotik_id = req.mikrotik_id; // Já validado pelo middleware
    
    console.log(`[${formatDateWithTimezone()}] [MIKROTIK AUTH] Notificação recebida de ${req.mikrotik.nome}:`, { 
      mac_address, 
      action, 
      usuario, 
      ip_address
    });

    // Validação de campos obrigatórios
    if (!mac_address || !action) {
      throw {
        message: 'Campos obrigatórios ausentes',
        code: 'VALIDATION_ERROR',
        details: 'mac_address e action são obrigatórios',
        source: 'API'
      };
    }

    // Validar formato do MAC
    if (!isValidMac(mac_address)) {
      throw {
        message: 'MAC address inválido',
        code: 'VALIDATION_ERROR',
        details: 'Formato esperado: XX:XX:XX:XX:XX:XX',
        source: 'API'
      };
    }

    // Buscar MAC com informações do plano atual
    const macs = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .select(`
          *,
          vendas(
            id,
            plano_id(
              id,
              nome,
              duracao
            ),
            pagamento_aprovado_em,
            status
          )
        `)
        .eq('mac_address', mac_address)
        .eq('mikrotik_id', mikrotik_id)
    );

    let macObj = macs && macs[0];

    // Se MAC não existe, cria um novo registro
    if (!macObj) {
      console.log('[MIKROTIK AUTH] MAC não encontrado, criando novo registro:', mac_address);
      
      macObj = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('macs')
          .insert([{
            mac_address,
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
    }

    // Determinar novo status baseado na ação
    let novoStatus = macObj.status;
    const agora = new Date().toISOString();

    switch (action.toLowerCase()) {
      case 'login':
      case 'connect':
      case 'authenticated':
        novoStatus = 'conectado';
        break;
      case 'logout':
      case 'disconnect':
      case 'disconnected':
        novoStatus = 'desconectado';
        break;
      default:
        console.warn('[MIKROTIK AUTH] Ação desconhecida:', action);
        novoStatus = 'conectado'; // Status genérico para ações não reconhecidas
    }

    // Verificar plano atual e tempo restante
    let planoAtual = null;
    let tempoRestante = 0;
    let planoExpirado = false;

    // Se MAC já está desconectado ou sendo desconectado, resetar lógica de tempo
    const acaoDesconexao = ['logout', 'disconnect', 'disconnected'].includes(action.toLowerCase());
    const macJaDesconectado = macObj.status === 'desconectado';

    if (acaoDesconexao || macJaDesconectado) {
      console.log(`[MIKROTIK AUTH] MAC sendo desconectado ou já desconectado - resetando tempo:`, {
        mac: mac_address,
        action,
        statusAtual: macObj.status,
        acaoDesconexao,
        macJaDesconectado
      });
      
      // Para ações de desconexão, não calcular tempo restante
      planoAtual = null;
      tempoRestante = 0;
      planoExpirado = false;
    } else if (macObj.vendas && macObj.vendas.length > 0) {
      // Só calcular tempo para ações de conexão/login
      const ultimaVendaAprovada = macObj.vendas
        .filter(v => v.status === 'aprovado' && v.pagamento_aprovado_em)
        .sort((a, b) => new Date(b.pagamento_aprovado_em) - new Date(a.pagamento_aprovado_em))[0];

      if (ultimaVendaAprovada && ultimaVendaAprovada.plano_id) {
        planoAtual = ultimaVendaAprovada.plano_id;
        const inicioPlano = new Date(ultimaVendaAprovada.pagamento_aprovado_em);
        const duracaoMinutos = planoAtual.duracao || 60;
        const fimPlano = new Date(inicioPlano.getTime() + duracaoMinutos * 60000);
        tempoRestante = Math.max(0, Math.floor((fimPlano.getTime() - new Date().getTime()) / 60000));

        // Verificar se o plano expirou
        planoExpirado = tempoRestante === 0;

        // Se o tempo expirou e está tentando conectar, forçar desconexão
        if (planoExpirado && (action.toLowerCase() === 'login' || action.toLowerCase() === 'connect' || action.toLowerCase() === 'authenticated')) {
          novoStatus = 'desconectado';
          console.log(`[MIKROTIK AUTH] Plano expirado (${planoAtual.nome}), bloqueando conexão:`, mac_address);
        }
      }
    }

    // Lógica especial para quando não há plano ativo
    if (!planoAtual && (action.toLowerCase() === 'login' || action.toLowerCase() === 'connect' || action.toLowerCase() === 'authenticated')) {
      novoStatus = 'conectado'; // Status para MAC sem plano tentando conectar
      console.log('[MIKROTIK AUTH] MAC sem plano ativo tentando conectar:', mac_address);
    }

    console.log('[MIKROTIK AUTH] Atualizando status:', {
      mac: mac_address,
      statusAnterior: macObj.status,
      novoStatus,
      action,
      planoAtual: planoAtual ? planoAtual.nome : null,
      tempoRestante,
      planoExpirado
    });

    // Preparar dados para atualização
    const dadosAtualizacao = {
      status: novoStatus,
      ultimo_acesso: agora
    };

    // Atualizar MAC no banco
    const macAtualizado = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .update(dadosAtualizacao)
        .eq('id', macObj.id)
        .select(`
          *,
          vendas(
            id,
            plano_id(
              id,
              nome,
              duracao
            ),
            pagamento_aprovado_em,
            status
          )
        `)
        .single()
    );

    // Se o MAC foi conectado com sucesso e tem plano ativo, marcar venda como autenticada
    if (novoStatus === 'conectado' && planoAtual && !planoExpirado) {
      // Buscar a venda mais recente aprovada para este MAC
      const vendaParaAutenticar = macObj.vendas
        ?.filter(v => v.status === 'aprovado' && v.pagamento_aprovado_em)
        .sort((a, b) => new Date(b.pagamento_aprovado_em) - new Date(a.pagamento_aprovado_em))[0];

      if (vendaParaAutenticar) {
        try {
          await handleSupabaseOperation(() =>
            supabaseAdmin
              .from('vendas')
              .update({ autenticado: true })
              .eq('id', vendaParaAutenticar.id)
          );
          
          console.log(`[MIKROTIK AUTH] Venda ${vendaParaAutenticar.id} marcada como autenticada para MAC ${mac_address}`);
        } catch (err) {
          console.log('[MIKROTIK AUTH] Coluna autenticado ainda não existe, continuando sem marcar...');
        }
      }
    }

    return res.json({
      success: true,
      message: planoExpirado 
        ? 'Plano expirado - conexão bloqueada' 
        : !planoAtual && novoStatus === 'conectado' 
          ? 'MAC sem plano ativo detectado'
          : 'Autenticação registrada com sucesso',
      data: {
        mac_id: macAtualizado.id,
        mac_address: macAtualizado.mac_address,
        status_anterior: macObj.status,
        status_atual: macAtualizado.status,
        ultimo_acesso: macAtualizado.ultimo_acesso,
        plano_atual: planoAtual ? {
          id: planoAtual.id,
          nome: planoAtual.nome,
          duracao: planoAtual.duracao,
          tempo_restante: tempoRestante,
          expirado: planoExpirado
        } : null,
        action_processada: action,
        conexao_permitida: !planoExpirado && (planoAtual || novoStatus !== 'conectado')
      }
    });

  } catch (err) {
    console.error('[MIKROTIK AUTH] Erro ao processar notificação:', err);
    next(err);
  }
});

// Endpoint GET para testar se a rota de autenticação está funcionando
app.get('/api/mikrotik/auth-notification/test', (req, res) => {
  res.json({
    message: 'Endpoint de autenticação Mikrotik está ativo',
    timestamp: new Date().toISOString(),
    expectedFields: {
      token: 'Token de segurança (obrigatório)',
      mac_address: 'MAC address no formato XX:XX:XX:XX:XX:XX',
      mikrotik_id: 'ID do Mikrotik',
      action: 'Ação: login, logout, connect, disconnect, etc.',
      usuario: 'Usuário autenticado (opcional)',
      ip_address: 'IP do cliente (opcional)'
    },
    example: {
      method: 'POST',
      url: '/api/mikrotik/auth-notification',
      body: {
        token: 'seu-token-aqui',
        mac_address: '00:11:22:33:44:55',
        mikrotik_id: '1',
        action: 'login',
        usuario: 'user123',
        ip_address: '192.168.1.100'
      }
    }
  });
});

// ==================================================
// ENDPOINT HEARTBEAT - MONITORAMENTO MIKROTIKS
// ==================================================

app.post('/api/mikrotik/heartbeat', validarTokenMikrotik, async (req, res, next) => {
  try {
    const { version, uptime } = req.body;
    const mikrotik_id = req.mikrotik_id; // Já validado pelo middleware
    
    console.log(`[${formatDateWithTimezone()}] [HEARTBEAT] Recebido heartbeat de ${req.mikrotik.nome}:`, { version, uptime });

    const agora = new Date().toISOString();

    // Atualizar último heartbeat do Mikrotik
    const mikrotikAtualizado = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('mikrotiks')
        .update({ 
          ultimo_heartbeat: agora,
          heartbeat_version: version || null,
          heartbeat_uptime: uptime || null
        })
        .eq('id', mikrotik_id)
        .select('id, nome, ultimo_heartbeat, heartbeat_version, heartbeat_uptime')
        .single()
    );

    console.log(`[${formatDateWithTimezone()}] [HEARTBEAT] Heartbeat registrado com sucesso:`, {
      mikrotik_id: mikrotikAtualizado.id,
      nome: mikrotikAtualizado.nome,
      ultimo_heartbeat: mikrotikAtualizado.ultimo_heartbeat,
      version: mikrotikAtualizado.heartbeat_version,
      uptime: mikrotikAtualizado.heartbeat_uptime
    });

    res.json({
      success: true,
      message: 'Heartbeat registrado com sucesso',
      data: {
        mikrotik_id: mikrotikAtualizado.id,
        nome: mikrotikAtualizado.nome,
        ultimo_heartbeat: mikrotikAtualizado.ultimo_heartbeat,
        version: mikrotikAtualizado.heartbeat_version,
        uptime: mikrotikAtualizado.heartbeat_uptime,
        timestamp: agora
      }
    });

  } catch (err) {
    console.error('[HEARTBEAT] Erro ao processar heartbeat:', err);
    next(err);
  }
});

// ==================================================
// ENDPOINTS ADMINISTRATIVOS PARA TOKENS
// ==================================================

// Endpoint para regenerar token de um MikroTik (apenas admins)
app.post('/api/admin/mikrotik/:id/regenerate-token', async (req, res, next) => {
  try {
    const mikrotik_id = req.params.id;
    
    console.log('[ADMIN] Regenerando token para MikroTik:', mikrotik_id);

    // Gerar novo token único
    const novoToken = 'mtk_' + Math.random().toString(36).substring(2, 10) + '_' + Math.random().toString(36).substring(2, 10);

    // Atualizar token no banco
    const mikrotikAtualizado = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('mikrotiks')
        .update({ api_token: novoToken })
        .eq('id', mikrotik_id)
        .select('id, nome, api_token')
        .single()
    );

    if (!mikrotikAtualizado) {
      throw {
        message: 'MikroTik não encontrado',
        code: 'NOT_FOUND',
        details: `MikroTik com ID ${mikrotik_id} não foi encontrado`,
        source: 'API'
      };
    }

    console.log('[ADMIN] Token regenerado com sucesso para MikroTik:', mikrotikAtualizado.nome);

    res.json({
      success: true,
      message: 'Token regenerado com sucesso',
      data: {
        mikrotik_id: mikrotikAtualizado.id,
        novo_token: mikrotikAtualizado.api_token
      }
    });

  } catch (err) {
    console.error('[ADMIN] Erro ao regenerar token:', err);
    next(err);
  }
});

// Endpoint para listar MikroTiks com tokens (apenas para admins)
app.get('/api/admin/mikrotiks', async (req, res, next) => {
  try {
    const { show_tokens } = req.query;
    
    console.log('[ADMIN] Listando MikroTiks. Mostrar tokens:', show_tokens === 'true');

    let selectFields = 'id, nome, provider_name, status, cliente_id, criado_em, profitpercentage, ultimo_heartbeat, heartbeat_version, heartbeat_uptime';
    
    // Incluir token se solicitado
    if (show_tokens === 'true') {
      selectFields += ', api_token';
    }

    const mikrotiks = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('mikrotiks')
        .select(selectFields)
        .order('nome')
    );

    res.json({
      success: true,
      data: mikrotiks,
      total: mikrotiks.length
    });

  } catch (err) {
    console.error('[ADMIN] Erro ao listar MikroTiks:', err);
    next(err);
  }
});

// ==================================================
// FUNÇÃO PARA VERIFICAR E DESCONECTAR MACs EXPIRADOS
// ==================================================

async function verificarMacsExpirados() {
  try {
    console.log(`[${formatDateWithTimezone()}] [EXPIRACAO] Verificando MACs com tempo expirado...`);

    // Buscar todos os MACs conectados com suas vendas
    const macsConectados = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .select(`
          id,
          mac_address,
          mikrotik_id,
          status,
          vendas(
            id,
            plano_id(
              id,
              nome,
              duracao
            ),
            pagamento_aprovado_em,
            status
          )
        `)
        .eq('status', 'conectado')
    );

    if (!macsConectados || macsConectados.length === 0) {
      console.log('[EXPIRACAO] Nenhum MAC conectado encontrado');
      return;
    }

    const agora = new Date();
    const macsParaDesconectar = [];

    for (const mac of macsConectados) {
      if (!mac.vendas || mac.vendas.length === 0) continue;

      // Pegar a venda mais recente aprovada
      const ultimaVendaAprovada = mac.vendas
        .filter(v => v.status === 'aprovado' && v.pagamento_aprovado_em)
        .sort((a, b) => new Date(b.pagamento_aprovado_em) - new Date(a.pagamento_aprovado_em))[0];

      if (ultimaVendaAprovada && ultimaVendaAprovada.plano_id) {
        const inicioPlano = new Date(ultimaVendaAprovada.pagamento_aprovado_em);
        const duracaoMinutos = ultimaVendaAprovada.plano_id.duracao || 60;
        const fimPlano = new Date(inicioPlano.getTime() + duracaoMinutos * 60000);

        // Se o tempo expirou, marcar para desconexão
        if (agora >= fimPlano) {
          macsParaDesconectar.push({
            id: mac.id,
            mac_address: mac.mac_address,
            plano: ultimaVendaAprovada.plano_id.nome,
            tempo_expirado: Math.floor((agora.getTime() - fimPlano.getTime()) / 60000)
          });
        }
      }
    }

    if (macsParaDesconectar.length > 0) {
      console.log(`[EXPIRACAO] Encontrados ${macsParaDesconectar.length} MACs expirados para desconectar`);

      // Desconectar MACs expirados
      for (const mac of macsParaDesconectar) {
        await handleSupabaseOperation(() =>
          supabaseAdmin
            .from('macs')
            .update({ 
              status: 'desconectado',
              ultimo_acesso: agora.toISOString()
            })
            .eq('id', mac.id)
        );

        console.log(`[EXPIRACAO] MAC ${mac.mac_address} desconectado - Plano ${mac.plano} expirado há ${mac.tempo_expirado} minutos`);
      }
    } else {
      console.log('[EXPIRACAO] Nenhum MAC expirado encontrado');
    }

  } catch (err) {
    console.error('[EXPIRACAO] Erro ao verificar MACs expirados:', err);
  }
}

// Agendar verificação de MACs expirados a cada 2 minutos
setInterval(verificarMacsExpirados, 2 * 60 * 1000);

// Endpoint para verificar status de MikroTiks online/offline
app.get('/api/mikrotik/status', async (req, res, next) => {
  try {
    console.log('[MIKROTIK STATUS] Verificando status dos MikroTiks...');

    // Buscar todos os MikroTiks
    const mikrotiks = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('mikrotiks')
        .select('id, nome, ultimo_heartbeat, heartbeat_version, heartbeat_uptime, status, cliente_id')
        .order('nome')
    );

    const agora = new Date();
    const limiteOffline = 15 * 60 * 1000; // 15 minutos em milliseconds

    // Determinar status online/offline baseado no último heartbeat
    const mikrotiksComStatus = mikrotiks.map(mikrotik => {
      let isOnline = false;
      let minutosOffline = null;

      if (mikrotik.ultimo_heartbeat) {
        const ultimoHeartbeat = new Date(mikrotik.ultimo_heartbeat);
        const diffMs = agora.getTime() - ultimoHeartbeat.getTime();
        minutosOffline = Math.floor(diffMs / (1000 * 60));
        isOnline = diffMs < limiteOffline;
      }

      return {
        ...mikrotik,
        is_online: isOnline,
        minutos_offline: minutosOffline,
        status_conexao: isOnline ? 'online' : 'offline'
      };
    });

    const estatisticas = {
      total: mikrotiksComStatus.length,
      online: mikrotiksComStatus.filter(m => m.is_online).length,
      offline: mikrotiksComStatus.filter(m => !m.is_online).length,
      nunca_conectou: mikrotiksComStatus.filter(m => !m.ultimo_heartbeat).length
    };

    console.log('[MIKROTIK STATUS] Estatísticas:', estatisticas);

    res.json({
      success: true,
      data: mikrotiksComStatus,
      estatisticas,
      limite_offline_minutos: 15
    });

  } catch (err) {
    console.error('[MIKROTIK STATUS] Erro ao verificar status:', err);
    next(err);
  }
});

// Middleware para bloquear tentativas de acesso a arquivos sensíveis
app.use((req, res, next) => {
  const suspiciousPatterns = [
    /\.env/i,
    /\.git/i,
    /\.aws/i,
    /config/i,
    /phpinfo/i,
    /\.php$/i,
    /\.yml$/i,
    /\.yaml$/i,
    /\.json$/i,
    /\.js$/i,
    /\.py$/i
  ];
  
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(req.path));
  
  if (isSuspicious && !req.path.startsWith('/api/')) {
    console.log(`[SECURITY] Bloqueando acesso suspeito: ${req.path} de ${req.ip}`);
    return res.status(404).json({ error: 'Not found' });
  }
  
  next();
});

// Registra o middleware de erro no final
app.use(errorHandler);

// Endpoint de saúde da API
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'PIX Mikro API'
  });
});

// Fallback para rotas não encontradas (apenas API)
app.use('*', (req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    res.status(404).json({ error: 'API endpoint not found' });
  } else {
    res.status(404).json({ 
      error: 'This is an API server. Frontend should be served separately.',
      api_docs: '/health'
    });
  }
});



// Porta
const port = process.env.PORT || 3000;
app.listen(port, () => {
  const apiDomain = process.env.API_DOMAIN || 'https://api.lucro.top';
  
  console.log('='.repeat(50));
  console.log(`🚀 PIX MIKRO API - Servidor iniciado`);
  console.log(`📡 API local: http://localhost:${port}/`);
  console.log(`🌐 Domínio público: ${apiDomain}`);
  console.log(`🏥 Health check: ${apiDomain}/health`);
  console.log(`📞 Webhook URL: ${apiDomain}/api/webhook/mercadopago`);
  console.log(`🔒 Middleware de segurança ativo`);
  console.log(`💳 Webhook Mercado Pago configurado`);
  console.log(`💓 Sistema de heartbeat MikroTik ativo`);
  console.log(`⚡ Sistema de tempo restante automático ativo`);
  console.log('='.repeat(50));
  
  // Aguarda 3 segundos e então verifica pagamentos pendentes e MACs expirados
  setTimeout(() => {
    verificarPagamentosPendentesStartup();
    verificarMacsExpirados();
  }, 3000);
}); 

