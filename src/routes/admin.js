const express = require('express');
const { v4: uuidv4 } = require('uuid');

const { supabaseAdmin, handleSupabaseOperation } = require('../services/database');
const { formatDateWithTimezone } = require('../utils/datetime');

const router = express.Router();

// ================================================================
// ROTAS DE ADMINISTRAÇÃO
// ================================================================

/**
 * POST /api/admin/mikrotik/:id/regenerate-token
 * Regenera token de API de um MikroTik
 */
router.post('/mikrotik/:id/regenerate-token', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      throw {
        message: 'ID do MikroTik é obrigatório',
        code: 'VALIDATION_ERROR',
        details: 'O ID deve ser fornecido na URL',
        source: 'API'
      };
    }

    console.log(`[${formatDateWithTimezone()}] [ADMIN] Regenerando token para MikroTik: ${id}`);

    // Verificar se o MikroTik existe
    const mikrotik = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('mikrotiks')
        .select('id, nome')
        .eq('id', id)
        .single()
    );

    if (!mikrotik) {
      throw {
        message: 'MikroTik não encontrado',
        code: 'NOT_FOUND',
        details: `MikroTik com ID ${id} não foi encontrado`,
        source: 'API'
      };
    }

    // Gerar novo token
    const novoToken = uuidv4();

    // Atualizar token no banco
    await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('mikrotiks')
        .update({
          api_token: novoToken,
          token_regenerado_em: new Date().toISOString()
        })
        .eq('id', id)
    );

    console.log(`[${formatDateWithTimezone()}] [ADMIN] Token regenerado para: ${mikrotik.nome}`);

    res.json({
      success: true,
      data: {
        mikrotik: {
          id: mikrotik.id,
          nome: mikrotik.nome
        },
        novo_token: novoToken,
        regenerado_em: formatDateWithTimezone()
      }
    });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [ADMIN] Erro ao regenerar token:`, error.message);
    next(error);
  }
});

/**
 * GET /api/admin/mikrotiks
 * Lista todos os MikroTiks cadastrados
 */
router.get('/mikrotiks', async (req, res, next) => {
  try {
    console.log(`[${formatDateWithTimezone()}] [ADMIN] Listando todos os MikroTiks`);

    // Buscar todos os MikroTiks com informações completas
    const mikrotiks = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('mikrotiks')
        .select(`
          id,
          nome,
          status,
          profitpercentage,
          api_token,
          criado_em,
          ultimo_heartbeat,
          status_conexao,
          macs_conectados,
          cliente_id
        `)
        .order('nome')
    );

    // Adicionar estatísticas de vendas para cada MikroTik
    const mikrotiksComStats = await Promise.all(
      mikrotiks.map(async (mk) => {
        try {
          // Buscar estatísticas de vendas
          const vendas = await handleSupabaseOperation(() =>
            supabaseAdmin
              .from('vendas')
              .select('status, valor, preco, valor_creditado_cliente')
              .eq('mikrotik_id', mk.id)
          );

          const vendasAprovadas = vendas.filter(v => v.status === 'aprovado');
          const totalVendas = vendasAprovadas.length;
          const valorTotal = vendasAprovadas.reduce((sum, v) => sum + (v.valor || v.preco || 0), 0);
          const valorCliente = vendasAprovadas.reduce((sum, v) => sum + (v.valor_creditado_cliente || 0), 0);

          // Buscar contagem de MACs
          const { count: totalMacs } = await supabaseAdmin
            .from('macs')
            .select('*', { count: 'exact', head: true })
            .eq('mikrotik_id', mk.id);

          // Calcular status de conexão
          const ultimoHeartbeat = mk.ultimo_heartbeat ? new Date(mk.ultimo_heartbeat) : null;
          const minutosOffline = ultimoHeartbeat ? 
            Math.floor((new Date() - ultimoHeartbeat) / (1000 * 60)) : null;
          
          const conexaoStatus = !ultimoHeartbeat ? 'nunca_conectado' :
                               minutosOffline > 10 ? 'offline' :
                               minutosOffline > 5 ? 'instavel' : 'online';

          return {
            ...mk,
            estatisticas: {
              total_vendas: totalVendas,
              valor_total: valorTotal,
              valor_cliente: valorCliente,
              valor_admin: valorTotal - valorCliente,
              total_macs: totalMacs || 0
            },
            conexao: {
              status: conexaoStatus,
              ultimo_heartbeat: ultimoHeartbeat ? formatDateWithTimezone(ultimoHeartbeat) : null,
              minutos_offline: minutosOffline
            },
            // Mascarar token por segurança
            api_token_masked: mk.api_token ? `${mk.api_token.substring(0, 8)}...` : null
          };
        } catch (error) {
          console.error(`Erro ao buscar stats para MikroTik ${mk.id}:`, error.message);
          return {
            ...mk,
            estatisticas: { total_vendas: 0, valor_total: 0, valor_cliente: 0, valor_admin: 0, total_macs: 0 },
            conexao: { status: 'erro', ultimo_heartbeat: null, minutos_offline: null },
            api_token_masked: mk.api_token ? `${mk.api_token.substring(0, 8)}...` : null
          };
        }
      })
    );

    // Estatísticas gerais
    const totalMikrotiks = mikrotiksComStats.length;
    const ativosMikrotiks = mikrotiksComStats.filter(mk => mk.status === 'Ativo').length;
    const onlineMikrotiks = mikrotiksComStats.filter(mk => mk.conexao.status === 'online').length;
    const totalVendasGeral = mikrotiksComStats.reduce((sum, mk) => sum + mk.estatisticas.total_vendas, 0);
    const valorTotalGeral = mikrotiksComStats.reduce((sum, mk) => sum + mk.estatisticas.valor_total, 0);

    console.log(`[${formatDateWithTimezone()}] [ADMIN] ${totalMikrotiks} MikroTiks encontrados`);

    res.json({
      success: true,
      data: {
        mikrotiks: mikrotiksComStats,
        estatisticas_gerais: {
          total_mikrotiks: totalMikrotiks,
          ativos: ativosMikrotiks,
          online: onlineMikrotiks,
          total_vendas: totalVendasGeral,
          valor_total: valorTotalGeral
        },
        timestamp: formatDateWithTimezone()
      }
    });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [ADMIN] Erro ao listar MikroTiks:`, error.message);
    next(error);
  }
});

module.exports = router;