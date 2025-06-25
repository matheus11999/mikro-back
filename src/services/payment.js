const { calcularComissao } = require('../utils/calculations');
const { getCurrentISOTimestamp } = require('../utils/datetime');
const { 
  supabaseAdmin, 
  handleSupabaseOperation, 
  incrementarSaldoAdmin, 
  incrementarSaldoCliente 
} = require('./database');

// Sistema de trava contra processamento duplicado
const processingPayments = new Set();

/**
 * Processa aprovação de pagamento de forma centralizada e consistente
 * @param {object} venda - Dados da venda
 * @param {object} mpData - Dados do Mercado Pago
 * @returns {Promise<void>}
 */
async function processarAprovacaoPagamento(venda, mpData) {
  // Verificação de status
  if (venda.status === 'aprovado') {
    console.log(`[PROCESSAMENTO] Venda ${venda.id} (Payment ID: ${venda.payment_id}) já foi aprovada anteriormente. Ignorando.`);
    return;
  }

  console.log(`[PROCESSAMENTO] Aprovando pagamento ${venda.payment_id}...`);
  const agora = getCurrentISOTimestamp();

  // Buscar informações do MikroTik
  const mikrotikInfo = await handleSupabaseOperation(() =>
    supabaseAdmin
      .from('mikrotiks')
      .select('cliente_id, profitpercentage')
      .eq('id', venda.mikrotik_id.id)
      .single()
  );

  // Calcular comissões usando função centralizada e corrigida
  const valorTotal = venda.valor || venda.preco;
  const { comissaoAdmin, valorCliente, porcentagemUsada } = calcularComissao(
    valorTotal, 
    mikrotikInfo?.profitpercentage
  );
  
  console.log(`[PROCESSAMENTO] Cálculo de comissão: Valor total R$ ${valorTotal.toFixed(3)}, Porcentagem: ${porcentagemUsada}%, Admin: R$ ${comissaoAdmin.toFixed(3)}, Cliente: R$ ${valorCliente.toFixed(3)}`);

  // 1. Incrementar saldos
  await incrementarSaldoAdmin(comissaoAdmin);
  if (mikrotikInfo?.cliente_id) {
    await incrementarSaldoCliente(mikrotikInfo.cliente_id, valorCliente);
  }
  
  console.log(`[PROCESSAMENTO] Saldos creditados - Admin: R$ ${comissaoAdmin.toFixed(3)}, Cliente: R$ ${valorCliente.toFixed(3)}`);

  // 2. Buscar dados históricos do plano
  const { data: planoInfo } = await supabaseAdmin
    .from('planos')
    .select('nome, duracao, preco')
    .eq('id', venda.plano_id.id)
    .single();

  // 3. Atualizar venda com dados históricos
  const atualizacaoVenda = {
    status: 'aprovado',
    pagamento_aprovado_em: agora,
    valor: valorTotal,
    valor_creditado_cliente: valorCliente,
    plano_nome: planoInfo?.nome,
    plano_duracao: planoInfo?.duracao,
    plano_preco: planoInfo?.preco,
    autenticado: false,
    status_detail: mpData?.status_detail,
    mercado_pago_status: mpData?.status,
    ultima_atualizacao_status: agora
  };

  await handleSupabaseOperation(() =>
    supabaseAdmin
      .from('vendas')
      .update(atualizacaoVenda)
      .eq('id', venda.id)
  );

  console.log(`[PROCESSAMENTO] Venda ${venda.id} aprovada com sucesso!`);
}

/**
 * Verifica se um pagamento está sendo processado
 * @param {string} paymentId - ID do pagamento
 * @returns {boolean}
 */
function isPaymentBeingProcessed(paymentId) {
  return processingPayments.has(paymentId);
}

/**
 * Marca pagamento como sendo processado
 * @param {string} paymentId - ID do pagamento
 */
function lockPaymentProcessing(paymentId) {
  processingPayments.add(paymentId);
}

/**
 * Remove trava de processamento do pagamento
 * @param {string} paymentId - ID do pagamento
 */
function unlockPaymentProcessing(paymentId) {
  processingPayments.delete(paymentId);
}

module.exports = {
  processarAprovacaoPagamento,
  isPaymentBeingProcessed,
  lockPaymentProcessing,
  unlockPaymentProcessing
};