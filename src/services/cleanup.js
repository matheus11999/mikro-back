const { supabaseAdmin, handleSupabaseOperation } = require('./database');
const { formatDateWithTimezone } = require('../utils/datetime');

/**
 * Service para limpeza e manutenção automática do sistema
 */

/**
 * Verifica e remove MACs expirados
 */
async function verificarMacsExpirados() {
  try {
    console.log(`[${formatDateWithTimezone()}] [CLEANUP] Iniciando verificação de MACs expirados`);

    // Buscar MACs que estão autenticados mas com tempo restante zerado ou expirados
    const macsExpirados = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .select('id, mac_address, tempo_restante, expires_at, mikrotik_id')
        .eq('autenticado', true)
        .or('tempo_restante.lte.0,expires_at.lt.' + new Date().toISOString())
    );

    if (!macsExpirados || macsExpirados.length === 0) {
      console.log(`[${formatDateWithTimezone()}] [CLEANUP] Nenhum MAC expirado encontrado`);
      return { removidos: 0, ativos: 0 };
    }

    console.log(`[${formatDateWithTimezone()}] [CLEANUP] ${macsExpirados.length} MACs expirados encontrados`);

    // Atualizar MACs expirados para não autenticados
    const idsParaAtualizar = macsExpirados.map(mac => mac.id);
    
    await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .update({
          autenticado: false,
          tempo_restante: 0,
          ultima_desautenticacao: new Date().toISOString()
        })
        .in('id', idsParaAtualizar)
    );

    // Contar MACs ainda ativos
    const { count: macsAtivos } = await supabaseAdmin
      .from('macs')
      .select('*', { count: 'exact', head: true })
      .eq('autenticado', true)
      .gt('tempo_restante', 0);

    console.log(`[${formatDateWithTimezone()}] [CLEANUP] ${macsExpirados.length} MACs desautenticados, ${macsAtivos || 0} MACs ainda ativos`);

    return {
      removidos: macsExpirados.length,
      ativos: macsAtivos || 0,
      macs_expirados: macsExpirados.map(mac => ({
        mac: mac.mac_address,
        tempo_restante: mac.tempo_restante,
        expires_at: mac.expires_at
      }))
    };

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [CLEANUP] Erro na verificação de MACs:`, error.message);
    throw error;
  }
}

/**
 * Limpeza de vendas antigas pendentes (mais de 24h)
 */
async function limparVendasPendentesAntigas() {
  try {
    console.log(`[${formatDateWithTimezone()}] [CLEANUP] Iniciando limpeza de vendas pendentes antigas`);

    // Data limite: 24 horas atrás
    const dataLimite = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Buscar vendas pendentes antigas
    const vendasAntigas = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('id, payment_id, data, pagamento_gerado_em')
        .eq('status', 'pendente')
        .lt('pagamento_gerado_em', dataLimite)
    );

    if (!vendasAntigas || vendasAntigas.length === 0) {
      console.log(`[${formatDateWithTimezone()}] [CLEANUP] Nenhuma venda pendente antiga encontrada`);
      return { expiradas: 0 };
    }

    console.log(`[${formatDateWithTimezone()}] [CLEANUP] ${vendasAntigas.length} vendas pendentes antigas encontradas`);

    // Marcar como expiradas
    const idsParaExpirar = vendasAntigas.map(venda => venda.id);
    
    await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .update({
          status: 'expirado',
          pagamento_expirado_em: new Date().toISOString(),
          ultima_atualizacao_status: new Date().toISOString()
        })
        .in('id', idsParaExpirar)
    );

    console.log(`[${formatDateWithTimezone()}] [CLEANUP] ${vendasAntigas.length} vendas marcadas como expiradas`);

    return {
      expiradas: vendasAntigas.length,
      vendas_expiradas: vendasAntigas.map(venda => ({
        id: venda.id,
        payment_id: venda.payment_id,
        criado_em: venda.pagamento_gerado_em
      }))
    };

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [CLEANUP] Erro na limpeza de vendas:`, error.message);
    throw error;
  }
}

/**
 * Executa todas as rotinas de limpeza
 */
async function executarLimpezaCompleta() {
  try {
    console.log(`[${formatDateWithTimezone()}] [CLEANUP] Iniciando limpeza completa do sistema`);

    const resultados = {
      timestamp: formatDateWithTimezone(),
      macs: await verificarMacsExpirados(),
      vendas: await limparVendasPendentesAntigas()
    };

    console.log(`[${formatDateWithTimezone()}] [CLEANUP] Limpeza completa finalizada:`, {
      macs_removidos: resultados.macs.removidos,
      macs_ativos: resultados.macs.ativos,
      vendas_expiradas: resultados.vendas.expiradas
    });

    return resultados;

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [CLEANUP] Erro na limpeza completa:`, error.message);
    throw error;
  }
}

/**
 * Agenda limpeza automática
 */
function agendarLimpezaAutomatica() {
  // Executar limpeza a cada 5 minutos
  setInterval(async () => {
    try {
      await executarLimpezaCompleta();
    } catch (error) {
      console.error(`[${formatDateWithTimezone()}] [CLEANUP] Erro na limpeza automática:`, error.message);
    }
  }, 5 * 60 * 1000); // 5 minutos

  console.log(`[${formatDateWithTimezone()}] [CLEANUP] Limpeza automática agendada (execução a cada 5 minutos)`);
}

module.exports = {
  verificarMacsExpirados,
  limparVendasPendentesAntigas,
  executarLimpezaCompleta,
  agendarLimpezaAutomatica
};