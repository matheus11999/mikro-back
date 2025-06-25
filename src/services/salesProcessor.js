/**
 * Serviço otimizado para processamento de vendas PIX MikroTik
 * - Melhor tratamento de erros
 * - Sistema anti-duplicação robusto
 * - Validações de segurança
 * - Processamento em lote quando possível
 * - Logging detalhado para auditoria
 */

const { calcularComissao, isValidFinancialValue } = require('../utils/calculations');
const { getCurrentISOTimestamp, formatDateWithTimezone } = require('../utils/datetime');
const { 
  supabaseAdmin, 
  handleSupabaseOperation, 
  incrementarSaldoAdmin, 
  incrementarSaldoCliente 
} = require('./database');

// Cache para evitar consultas desnecessárias
const mikrotiksCache = new Map();
const planosCache = new Map();

// Sistema robusto de controle de processamento
class PaymentProcessor {
  constructor() {
    this.processingPayments = new Map(); // paymentId -> { startTime, promise }
    this.maxProcessingTime = 30000; // 30 segundos timeout
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Limpeza a cada minuto
  }

  // Limpeza automática de processamentos orfãos
  cleanup() {
    const now = Date.now();
    for (const [paymentId, info] of this.processingPayments.entries()) {
      if (now - info.startTime > this.maxProcessingTime) {
        console.warn(`[SALES-PROCESSOR] Removendo processamento órfão: ${paymentId}`);
        this.processingPayments.delete(paymentId);
      }
    }
  }

  // Verificar se pagamento está sendo processado
  isBeingProcessed(paymentId) {
    return this.processingPayments.has(paymentId);
  }

  // Iniciar processamento com timeout automático
  async startProcessing(paymentId, processingFunction) {
    if (this.isBeingProcessed(paymentId)) {
      throw new Error(`Pagamento ${paymentId} já está sendo processado`);
    }

    const promise = this.executeWithTimeout(paymentId, processingFunction);
    this.processingPayments.set(paymentId, {
      startTime: Date.now(),
      promise
    });

    try {
      const result = await promise;
      return result;
    } finally {
      this.processingPayments.delete(paymentId);
    }
  }

  // Executar com timeout
  async executeWithTimeout(paymentId, processingFunction) {
    return Promise.race([
      processingFunction(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout no processamento de ${paymentId}`)), this.maxProcessingTime)
      )
    ]);
  }

  // Destruir recursos
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.processingPayments.clear();
  }
}

const processor = new PaymentProcessor();

/**
 * Cache para informações de MikroTik
 */
async function getMikrotikInfo(mikrotikId) {
  if (mikrotiksCache.has(mikrotikId)) {
    const cached = mikrotiksCache.get(mikrotikId);
    // Cache válido por 5 minutos
    if (Date.now() - cached.timestamp < 300000) {
      return cached.data;
    }
  }

  const mikrotikInfo = await handleSupabaseOperation(() =>
    supabaseAdmin
      .from('mikrotiks')
      .select('cliente_id, profitpercentage, nome, status')
      .eq('id', mikrotikId)
      .single()
  );

  if (!mikrotikInfo) {
    throw new Error(`MikroTik ${mikrotikId} não encontrado`);
  }

  if (mikrotikInfo.status !== 'Ativo') {
    throw new Error(`MikroTik ${mikrotikInfo.nome} não está ativo`);
  }

  mikrotiksCache.set(mikrotikId, {
    data: mikrotikInfo,
    timestamp: Date.now()
  });

  return mikrotikInfo;
}

/**
 * Cache para informações de planos
 */
async function getPlanoInfo(planoId) {
  if (planosCache.has(planoId)) {
    const cached = planosCache.get(planoId);
    // Cache válido por 10 minutos
    if (Date.now() - cached.timestamp < 600000) {
      return cached.data;
    }
  }

  const planoInfo = await handleSupabaseOperation(() =>
    supabaseAdmin
      .from('planos')
      .select('nome, duracao, preco, ativo')
      .eq('id', planoId)
      .single()
  );

  if (!planoInfo) {
    throw new Error(`Plano ${planoId} não encontrado`);
  }

  if (!planoInfo.ativo) {
    throw new Error(`Plano ${planoInfo.nome} não está ativo`);
  }

  planosCache.set(planoId, {
    data: planoInfo,
    timestamp: Date.now()
  });

  return planoInfo;
}

/**
 * Validações de segurança para venda
 */
function validateSaleData(venda, mpData) {
  const errors = [];

  // Validar venda
  if (!venda?.id) errors.push('ID da venda inválido');
  if (!venda?.payment_id) errors.push('Payment ID inválido');
  if (!venda?.mikrotik_id?.id) errors.push('MikroTik ID inválido');
  if (!venda?.plano_id?.id) errors.push('Plano ID inválido');
  
  const valorTotal = venda?.valor || venda?.preco;
  if (!isValidFinancialValue(valorTotal)) errors.push('Valor da venda inválido');
  if (valorTotal <= 0) errors.push('Valor da venda deve ser maior que zero');
  if (valorTotal > 10000) errors.push('Valor da venda muito alto (limite: R$ 10.000)');

  // Validar dados do Mercado Pago
  if (!mpData?.status) errors.push('Status do Mercado Pago inválido');
  if (mpData.status !== 'approved') errors.push(`Status esperado: approved, recebido: ${mpData.status}`);

  if (errors.length > 0) {
    throw new Error(`Validação falhou: ${errors.join(', ')}`);
  }
}

/**
 * Processar aprovação de pagamento otimizada
 */
async function processarAprovacaoPagamento(venda, mpData) {
  const paymentId = venda.payment_id;
  const timestamp = formatDateWithTimezone();
  
  console.log(`[${timestamp}] [SALES-PROCESSOR] Iniciando processamento: ${paymentId}`);

  return processor.startProcessing(paymentId, async () => {
    try {
      // 1. Verificar se já foi processado
      if (venda.status === 'aprovado') {
        console.log(`[${formatDateWithTimezone()}] [SALES-PROCESSOR] Venda ${venda.id} já aprovada. Ignorando.`);
        return { success: true, message: 'Já processado', vendaId: venda.id };
      }

      // 2. Validações de segurança
      validateSaleData(venda, mpData);

      const agora = getCurrentISOTimestamp();
      const valorTotal = venda.valor || venda.preco;

      // 3. Buscar informações com cache
      const [mikrotikInfo, planoInfo] = await Promise.all([
        getMikrotikInfo(venda.mikrotik_id.id),
        getPlanoInfo(venda.plano_id.id)
      ]);

      // 4. Calcular comissões
      const { comissaoAdmin, valorCliente, porcentagemUsada } = calcularComissao(
        valorTotal, 
        mikrotikInfo.profitpercentage
      );
      
      console.log(`[${formatDateWithTimezone()}] [SALES-PROCESSOR] Cálculo: Total R$ ${valorTotal.toFixed(3)}, ${porcentagemUsada}% -> Admin: R$ ${comissaoAdmin.toFixed(3)}, Cliente: R$ ${valorCliente.toFixed(3)}`);

      // 5. Verificar se há cliente válido
      if (!mikrotikInfo.cliente_id) {
        console.warn(`[${formatDateWithTimezone()}] [SALES-PROCESSOR] MikroTik ${mikrotikInfo.nome} sem cliente associado`);
      }

      // 6. Processar transações financeiras em paralelo
      const transacaoPromises = [
        incrementarSaldoAdmin(comissaoAdmin)
      ];

      if (mikrotikInfo.cliente_id) {
        transacaoPromises.push(
          incrementarSaldoCliente(mikrotikInfo.cliente_id, valorCliente)
        );
      }

      await Promise.all(transacaoPromises);
      
      console.log(`[${formatDateWithTimezone()}] [SALES-PROCESSOR] Saldos creditados - Admin: R$ ${comissaoAdmin.toFixed(3)}, Cliente: R$ ${valorCliente.toFixed(3)}`);

      // 7. Atualizar venda com dados históricos preservados
      const atualizacaoVenda = {
        status: 'aprovado',
        pagamento_aprovado_em: agora,
        valor: valorTotal,
        valor_creditado_cliente: valorCliente,
        valor_comissao_admin: comissaoAdmin,
        porcentagem_comissao: porcentagemUsada,
        
        // Preservar dados históricos do plano
        plano_nome: planoInfo.nome,
        plano_duracao: planoInfo.duracao,
        plano_preco: planoInfo.preco,
        
        // Dados de integração
        autenticado: false,
        status_detail: mpData.status_detail,
        mercado_pago_status: mpData.status,
        ultima_atualizacao_status: agora,
        
        // Metadados para auditoria
        processado_em: agora,
        mikrotik_nome: mikrotikInfo.nome,
        cliente_id: mikrotikInfo.cliente_id
      };

      await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('vendas')
          .update(atualizacaoVenda)
          .eq('id', venda.id)
      );

      // 8. Log de sucesso
      console.log(`[${formatDateWithTimezone()}] [SALES-PROCESSOR] ✅ Venda ${venda.id} processada com sucesso! Payment: ${paymentId}`);

      return {
        success: true,
        vendaId: venda.id,
        paymentId,
        valorTotal,
        comissaoAdmin,
        valorCliente,
        porcentagemUsada,
        mikrotik: mikrotikInfo.nome,
        plano: planoInfo.nome
      };

    } catch (error) {
      console.error(`[${formatDateWithTimezone()}] [SALES-PROCESSOR] ❌ Erro no processamento ${paymentId}:`, error.message);
      
      // Log de erro para auditoria
      try {
        await handleSupabaseOperation(() =>
          supabaseAdmin
            .from('vendas')
            .update({
              status: 'erro_processamento',
              erro_detalhes: error.message,
              ultima_atualizacao_status: getCurrentISOTimestamp()
            })
            .eq('id', venda.id)
        );
      } catch (logError) {
        console.error(`[${formatDateWithTimezone()}] [SALES-PROCESSOR] Erro ao salvar log de erro:`, logError.message);
      }

      throw error;
    }
  });
}

/**
 * Processar múltiplas vendas em lote (quando possível)
 */
async function processarVendasEmLote(vendas, mpDataArray) {
  console.log(`[${formatDateWithTimezone()}] [SALES-PROCESSOR] Processando ${vendas.length} vendas em lote`);
  
  const resultados = [];
  const promises = vendas.map(async (venda, index) => {
    try {
      const mpData = mpDataArray[index];
      const resultado = await processarAprovacaoPagamento(venda, mpData);
      return { success: true, venda: venda.id, resultado };
    } catch (error) {
      return { success: false, venda: venda.id, error: error.message };
    }
  });

  const results = await Promise.allSettled(promises);
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      resultados.push(result.value);
    } else {
      resultados.push({
        success: false,
        venda: vendas[index].id,
        error: result.reason?.message || 'Erro desconhecido'
      });
    }
  });

  const sucessos = resultados.filter(r => r.success).length;
  const falhas = resultados.length - sucessos;
  
  console.log(`[${formatDateWithTimezone()}] [SALES-PROCESSOR] Lote concluído: ${sucessos} sucessos, ${falhas} falhas`);
  
  return {
    total: vendas.length,
    sucessos,
    falhas,
    resultados
  };
}

/**
 * Limpar cache manualmente
 */
function clearCache() {
  mikrotiksCache.clear();
  planosCache.clear();
  console.log(`[${formatDateWithTimezone()}] [SALES-PROCESSOR] Cache limpo`);
}

/**
 * Obter estatísticas do processador
 */
function getProcessorStats() {
  return {
    processamentosAtivos: processor.processingPayments.size,
    cacheSize: {
      mikrotiks: mikrotiksCache.size,
      planos: planosCache.size
    },
    uptime: process.uptime()
  };
}

// Limpeza quando o processo termina
process.on('beforeExit', () => {
  processor.destroy();
});

module.exports = {
  processarAprovacaoPagamento,
  processarVendasEmLote,
  clearCache,
  getProcessorStats,
  
  // Compatibilidade com versão anterior
  isPaymentBeingProcessed: (paymentId) => processor.isBeingProcessed(paymentId)
};