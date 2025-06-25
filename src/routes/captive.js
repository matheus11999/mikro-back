const express = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const { supabaseAdmin, handleSupabaseOperation } = require('../services/database');
const { calcularComissao } = require('../utils/calculations');
const { formatDateWithTimezone, getCurrentISOTimestamp } = require('../utils/datetime');
const { apiDomain, mercadoPago } = require('../config/env');

const router = express.Router();

// Schemas de validação
const planosSchema = z.object({
  mikrotik_id: z.string().uuid('mikrotik_id deve ser um UUID válido')
});

const statusSchema = z.object({
  mac: z.string().min(1, 'MAC address é obrigatório'),
  mikrotik_id: z.string().uuid('mikrotik_id deve ser um UUID válido')
});

const pixSchema = z.object({
  mac: z.string().min(1, 'MAC address é obrigatório'),
  plano_id: z.string().uuid('plano_id deve ser um UUID válido'),
  mikrotik_id: z.string().uuid('mikrotik_id deve ser um UUID válido')
});

const verifySchema = z.object({
  payment_id: z.string().min(1, 'payment_id é obrigatório')
});

// ================================================================
// ROTAS DO CAPTIVE PORTAL
// ================================================================

/**
 * GET /api/captive-check
 * Health check do captive portal
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'captive-portal',
    timestamp: formatDateWithTimezone()
  });
});

/**
 * POST /api/captive-check/planos
 * Lista planos disponíveis para um MikroTik
 */
router.post('/planos', async (req, res, next) => {
  try {
    console.log(`[${formatDateWithTimezone()}] [CAPTIVE] Listando planos para MikroTik:`, req.body.mikrotik_id);
    
    // Validar dados de entrada
    const { mikrotik_id } = planosSchema.parse(req.body);

    // Buscar planos do MikroTik
    const planos = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('planos')
        .select('id, nome, preco, duracao')
        .eq('mikrotik_id', mikrotik_id)
        .order('preco', { ascending: true })
    );

    if (!planos || planos.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Nenhum plano encontrado',
          code: 'NO_PLANS_FOUND',
          details: 'Não há planos cadastrados para este MikroTik'
        }
      });
    }

    console.log(`[${formatDateWithTimezone()}] [CAPTIVE] ${planos.length} planos encontrados`);

    res.json({
      success: true,
      data: {
        planos: planos.map(plano => ({
          id: plano.id,
          nome: plano.nome,
          preco: plano.preco,
          duracao: plano.duracao,
          duracao_formatada: `${plano.duracao} minutos`
        }))
      }
    });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [CAPTIVE] Erro ao listar planos:`, error.message);
    next(error);
  }
});

/**
 * POST /api/captive-check/status
 * Verifica status de autenticação de um MAC
 */
router.post('/status', async (req, res, next) => {
  try {
    console.log(`[${formatDateWithTimezone()}] [CAPTIVE] Verificando status do MAC:`, req.body.mac);
    
    // Validar dados de entrada
    const { mac, mikrotik_id } = statusSchema.parse(req.body);

    // Buscar MAC no banco
    const macObj = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .select('*')
        .eq('mac_address', mac)
        .eq('mikrotik_id', mikrotik_id)
        .single()
    );

    if (!macObj) {
      console.log(`[${formatDateWithTimezone()}] [CAPTIVE] MAC não encontrado: ${mac}`);
      return res.json({
        success: true,
        data: {
          autenticado: false,
          tempo_restante: 0,
          status: 'nao_autenticado'
        }
      });
    }

    const agora = new Date();
    const tempoRestante = Math.max(0, macObj.tempo_restante || 0);
    const autenticado = macObj.autenticado && tempoRestante > 0;

    console.log(`[${formatDateWithTimezone()}] [CAPTIVE] Status MAC ${mac}: ${autenticado ? 'autenticado' : 'não autenticado'}, tempo: ${tempoRestante}min`);

    res.json({
      success: true,
      data: {
        autenticado,
        tempo_restante: tempoRestante,
        status: autenticado ? 'autenticado' : 'nao_autenticado',
        expires_at: macObj.expires_at || null
      }
    });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [CAPTIVE] Erro ao verificar status:`, error.message);
    next(error);
  }
});

/**
 * POST /api/captive-check/pix
 * Gera QR Code PIX para pagamento
 */
router.post('/pix', async (req, res, next) => {
  try {
    console.log(`[${formatDateWithTimezone()}] [CAPTIVE] Gerando PIX para MAC:`, req.body.mac);
    
    // Validar dados de entrada
    const { mac, plano_id, mikrotik_id } = pixSchema.parse(req.body);

    // Verificar se o plano existe e pertence ao MikroTik
    const plano = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('planos')
        .select('*')
        .eq('id', plano_id)
        .eq('mikrotik_id', mikrotik_id)
        .single()
    );

    if (!plano) {
      throw {
        message: 'Plano não encontrado',
        code: 'PLAN_NOT_FOUND',
        details: 'O plano selecionado não existe ou não pertence a este MikroTik',
        source: 'API'
      };
    }

    // Buscar ou criar MAC
    let macObj = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .select('*')
        .eq('mac_address', mac)
        .eq('mikrotik_id', mikrotik_id)
        .single()
    );

    if (!macObj) {
      console.log(`[${formatDateWithTimezone()}] [CAPTIVE] Criando novo MAC: ${mac}`);
      macObj = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('macs')
          .insert({
            mac_address: mac,
            mikrotik_id: mikrotik_id,
            tempo_restante: 0,
            autenticado: false
          })
          .select()
          .single()
      );
    }

    // Verificar se já há venda pendente
    const vendaExistente = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('*')
        .eq('mac_id', macObj.id)
        .eq('status', 'pendente')
        .single()
    );

    if (vendaExistente) {
      console.log(`[${formatDateWithTimezone()}] [CAPTIVE] Venda pendente encontrada:`, vendaExistente.payment_id);
      return res.json({
        success: true,
        data: {
          payment_id: vendaExistente.payment_id,
          qr_code: vendaExistente.qrcode,
          chave_pix: vendaExistente.chave_pix,
          valor: vendaExistente.valor || vendaExistente.preco,
          plano: {
            nome: plano.nome,
            duracao: plano.duracao
          }
        }
      });
    }

    // Criar pagamento no Mercado Pago
    const paymentData = {
      transaction_amount: plano.preco,
      description: `WiFi - ${plano.nome}`,
      payment_method_id: 'pix',
      payer: {
        email: 'cliente@wifi.com'
      },
      notification_url: `${apiDomain}/api/webhook/mercadopago`
    };

    console.log(`[${formatDateWithTimezone()}] [CAPTIVE] Criando pagamento MP para R$ ${plano.preco}`);

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mercadoPago.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentData)
    });

    if (!mpResponse.ok) {
      const errorData = await mpResponse.text();
      console.error(`[${formatDateWithTimezone()}] [CAPTIVE] Erro MP:`, errorData);
      throw {
        message: 'Erro ao criar pagamento',
        code: 'PAYMENT_CREATION_ERROR',
        details: 'Falha na comunicação com Mercado Pago',
        source: 'MERCADO_PAGO'
      };
    }

    const mpData = await mpResponse.json();
    console.log(`[${formatDateWithTimezone()}] [CAPTIVE] Pagamento MP criado:`, mpData.id);

    // Criar venda no banco
    const vendaData = {
      mikrotik_id: mikrotik_id,
      plano_id: plano_id,
      mac_id: macObj.id,
      valor: plano.preco,
      preco: plano.preco, // Compatibilidade
      descricao: paymentData.description,
      chave_pix: mpData.point_of_interaction?.transaction_data?.qr_code || '',
      qrcode: mpData.point_of_interaction?.transaction_data?.qr_code_base64 || '',
      payment_id: mpData.id.toString(),
      status: 'pendente',
      pagamento_gerado_em: getCurrentISOTimestamp(),
      ticket_url: mpData.id.toString()
    };

    const novaVenda = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .insert(vendaData)
        .select()
        .single()
    );

    console.log(`[${formatDateWithTimezone()}] [CAPTIVE] Venda criada:`, novaVenda.id);

    res.json({
      success: true,
      data: {
        payment_id: mpData.id.toString(),
        qr_code: mpData.point_of_interaction?.transaction_data?.qr_code_base64 || '',
        chave_pix: mpData.point_of_interaction?.transaction_data?.qr_code || '',
        valor: plano.preco,
        plano: {
          nome: plano.nome,
          duracao: plano.duracao
        }
      }
    });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [CAPTIVE] Erro ao gerar PIX:`, error.message);
    next(error);
  }
});

/**
 * POST /api/captive-check/verify
 * Verifica status do pagamento
 */
router.post('/verify', async (req, res, next) => {
  try {
    const { payment_id } = verifySchema.parse(req.body);
    
    console.log(`[${formatDateWithTimezone()}] [CAPTIVE] Verificando pagamento:`, payment_id);

    // Buscar venda no banco
    const venda = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('*, mac_id(*), plano_id(*), mikrotik_id(*)')
        .eq('payment_id', payment_id)
        .single()
    );

    if (!venda) {
      throw {
        message: 'Pagamento não encontrado',
        code: 'PAYMENT_NOT_FOUND',
        details: `Pagamento ${payment_id} não foi encontrado`,
        source: 'API'
      };
    }

    console.log(`[${formatDateWithTimezone()}] [CAPTIVE] Status atual: ${venda.status}`);

    res.json({
      success: true,
      data: {
        status: venda.status,
        aprovado: venda.status === 'aprovado',
        valor: venda.valor || venda.preco,
        plano: {
          nome: venda.plano_nome || venda.plano_id?.nome,
          duracao: venda.plano_duracao || venda.plano_id?.duracao
        },
        pagamento_aprovado_em: venda.pagamento_aprovado_em,
        autenticado: venda.autenticado || false
      }
    });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [CAPTIVE] Erro ao verificar pagamento:`, error.message);
    next(error);
  }
});

/**
 * GET /api/captive-check/payment-status/:payment_id
 * Consulta status específico de pagamento
 */
router.get('/payment-status/:payment_id', async (req, res, next) => {
  try {
    const { payment_id } = req.params;
    
    if (!payment_id) {
      throw {
        message: 'payment_id é obrigatório',
        code: 'VALIDATION_ERROR',
        details: 'O ID do pagamento deve ser fornecido na URL',
        source: 'API'
      };
    }

    console.log(`[${formatDateWithTimezone()}] [CAPTIVE] Consultando status: ${payment_id}`);

    // Buscar no Mercado Pago para status atualizado
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: {
        'Authorization': `Bearer ${mercadoPago.accessToken}`
      }
    });

    if (!mpResponse.ok) {
      throw {
        message: 'Erro ao consultar Mercado Pago',
        code: 'MP_QUERY_ERROR',
        details: 'Falha na consulta do status do pagamento',
        source: 'MERCADO_PAGO'
      };
    }

    const mpData = await mpResponse.json();

    // Buscar venda local
    const venda = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('*')
        .eq('payment_id', payment_id)
        .single()
    );

    res.json({
      success: true,
      data: {
        payment_id: payment_id,
        mp_status: mpData.status,
        mp_status_detail: mpData.status_detail,
        local_status: venda?.status || 'not_found',
        valor: mpData.transaction_amount,
        criado_em: mpData.date_created,
        aprovado_em: mpData.date_approved
      }
    });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [CAPTIVE] Erro ao consultar status:`, error.message);
    next(error);
  }
});

module.exports = router;