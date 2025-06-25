const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const { supabaseAdmin, handleSupabaseOperation } = require('../services/database');
// Usando o novo processador otimizado
const { 
  processarAprovacaoPagamento, 
  isPaymentBeingProcessed 
} = require('../services/salesProcessor');
const { formatDateWithTimezone, getCurrentISOTimestamp } = require('../utils/datetime');
const { mercadoPago, apiDomain } = require('../config/env');

const router = express.Router();

// ================================================================
// ROTAS DO WEBHOOK MERCADO PAGO
// ================================================================

/**
 * GET /api/webhook/mercadopago
 * Endpoint GET para verificação (alguns sistemas fazem verificação GET primeiro)
 */
router.get('/mercadopago', (req, res) => {
  console.log(`[${formatDateWithTimezone()}] [WEBHOOK] GET recebido - Verificação do webhook`);
  res.json({
    status: 'webhook_active',
    service: 'mercado_pago',
    timestamp: formatDateWithTimezone()
  });
});

/**
 * POST /api/webhook/mercadopago
 * Processa notificações de pagamento do Mercado Pago
 */
router.post('/mercadopago', async (req, res, next) => {
  let paymentId = null;
  
  try {
    console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Webhook recebido:`, JSON.stringify(req.body, null, 2));

    // Extrair payment_id do webhook
    paymentId = req.body?.data?.id || req.body?.id;
    
    if (!paymentId) {
      console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Payment ID não encontrado no webhook`);
      return res.status(200).json({ success: false, message: 'Payment ID não encontrado' });
    }

    console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Processando payment_id: ${paymentId}`);

    // Verificar se o pagamento já está sendo processado (anti-duplicação)
    if (isPaymentBeingProcessed(paymentId)) {
      console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Payment ${paymentId} já está sendo processado. Ignorando.`);
      return res.status(200).json({ success: false, message: 'Pagamento já sendo processado' });
    }

    try {
      // Buscar dados do pagamento no Mercado Pago
      console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Consultando MP para payment_id: ${paymentId}`);
      
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${mercadoPago.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!mpResponse.ok) {
        throw new Error(`Erro ao consultar MP: ${mpResponse.status} ${mpResponse.statusText}`);
      }

      const mpData = await mpResponse.json();
      console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Dados MP recebidos:`, {
        id: mpData.id,
        status: mpData.status,
        status_detail: mpData.status_detail,
        transaction_amount: mpData.transaction_amount
      });

      // Buscar venda correspondente no banco
      const venda = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('vendas')
          .select('*, mac_id(*), plano_id(*), mikrotik_id(*)')
          .eq('payment_id', paymentId.toString())
          .single()
      );

      if (!venda) {
        console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Venda não encontrada para payment_id: ${paymentId}`);
        return res.status(200).json({ success: false, message: 'Venda não encontrada' });
      }

      console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Venda encontrada: ${venda.id}, status atual: ${venda.status}`);

      // Processar baseado no status do MP
      if (mpData.status === 'approved') {
        await processarAprovacaoPagamento(venda, mpData);
        console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Pagamento ${paymentId} processado com sucesso`);
        
      } else if (mpData.status === 'rejected' || mpData.status === 'cancelled') {
        await processarRejeicaoPagamento(venda, mpData);
        console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Pagamento ${paymentId} rejeitado/cancelado`);
        
      } else if (mpData.status === 'pending') {
        await atualizarStatusPendente(venda, mpData);
        console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Pagamento ${paymentId} ainda pendente`);
        
      } else {
        console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Status não tratado: ${mpData.status}`);
      }

      res.status(200).json({ 
        success: true, 
        message: 'Webhook processado com sucesso',
        payment_id: paymentId,
        status: mpData.status
      });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [WEBHOOK] Erro no processamento:`, error.message);
    
    // Sempre retornar 200 para o MP não reenviar
    res.status(200).json({ 
      success: false, 
      message: 'Erro no processamento',
      error: error.message
    });
  }
});

/**
 * POST /api/webhook/mercadopago/test
 * Endpoint para testes do webhook
 */
router.post('/mercadopago/test', async (req, res) => {
  try {
    console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Teste do webhook iniciado`);
    
    const testData = req.body || {
      action: "payment.updated",
      api_version: "v1",
      data: {
        id: "12345678901"
      },
      date_created: getCurrentISOTimestamp(),
      id: 1234567890,
      live_mode: false,
      type: "payment",
      user_id: "123456789"
    };

    console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Dados de teste:`, testData);

    // Enviar para o webhook real
    const webhookUrl = `${apiDomain}/api/webhook/mercadopago`;
    console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Enviando para: ${webhookUrl}`);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });

    const result = await response.text();
    
    res.json({
      success: true,
      message: 'Teste do webhook executado',
      webhook_response: {
        status: response.status,
        body: result
      }
    });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [WEBHOOK] Erro no teste:`, error.message);
    res.status(500).json({
      success: false,
      message: 'Erro no teste do webhook',
      error: error.message
    });
  }
});

// ================================================================
// FUNÇÕES AUXILIARES DE PROCESSAMENTO
// ================================================================

/**
 * Processa rejeição/cancelamento de pagamento
 */
async function processarRejeicaoPagamento(venda, mpData) {
  if (venda.status === 'rejeitado' || venda.status === 'cancelado') {
    console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Venda ${venda.id} já foi rejeitada/cancelada. Ignorando.`);
    return;
  }

  const agora = getCurrentISOTimestamp();
  const novoStatus = mpData.status === 'cancelled' ? 'cancelado' : 'rejeitado';
  const campoData = mpData.status === 'cancelled' ? 'pagamento_cancelado_em' : 'pagamento_rejeitado_em';

  // Reverter saldos se necessário (caso tenha sido aprovado anteriormente)
  if (venda.status === 'aprovado') {
    await reverterSaldos(venda);
  }

  // Atualizar status da venda
  const atualizacao = {
    status: novoStatus,
    [campoData]: agora,
    status_detail: mpData.status_detail,
    mercado_pago_status: mpData.status,
    ultima_atualizacao_status: agora
  };

  await handleSupabaseOperation(() =>
    supabaseAdmin
      .from('vendas')
      .update(atualizacao)
      .eq('id', venda.id)
  );

  console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Venda ${venda.id} marcada como ${novoStatus}`);
}

/**
 * Atualiza status para pendente com detalhes atualizados
 */
async function atualizarStatusPendente(venda, mpData) {
  const agora = getCurrentISOTimestamp();

  const atualizacao = {
    status_detail: mpData.status_detail,
    mercado_pago_status: mpData.status,
    ultima_atualizacao_status: agora
  };

  await handleSupabaseOperation(() =>
    supabaseAdmin
      .from('vendas')
      .update(atualizacao)
      .eq('id', venda.id)
  );

  console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Status pendente atualizado para venda ${venda.id}`);
}

/**
 * Reverte saldos em caso de cancelamento após aprovação
 */
async function reverterSaldos(venda) {
  console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Revertendo saldos da venda ${venda.id}`);
  
  try {
    // Calcular valores a reverter
    const valorAdminReverter = venda.valor_creditado_admin || 0;
    const valorClienteReverter = venda.valor_creditado_cliente || 0;

    // Reverter saldo admin
    if (valorAdminReverter > 0) {
      await handleSupabaseOperation(() => 
        supabaseAdmin.rpc('incrementar_saldo_admin', { valor: -valorAdminReverter })
      );
    }

    // Reverter saldo cliente
    if (valorClienteReverter > 0) {
      const mikrotikInfo = await handleSupabaseOperation(() => 
        supabaseAdmin.from('mikrotiks').select('cliente_id').eq('id', venda.mikrotik_id.id).single()
      );
      
      if (mikrotikInfo?.cliente_id) {
        await handleSupabaseOperation(() => 
          supabaseAdmin.rpc('incrementar_saldo_cliente', { 
            cliente_id: mikrotikInfo.cliente_id, 
            valor: -valorClienteReverter 
          })
        );
      }
    }

    console.log(`[${formatDateWithTimezone()}] [WEBHOOK] Saldos revertidos. Admin: -${valorAdminReverter.toFixed(3)}, Cliente: -${valorClienteReverter.toFixed(3)}`);

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [WEBHOOK] Erro ao reverter saldos:`, error.message);
  }
}

module.exports = router;