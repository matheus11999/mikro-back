const { supabaseAdmin, handleSupabaseOperation } = require('../services/database');
const { formatDateWithTimezone } = require('../utils/datetime');

/**
 * Middleware para validar token do MikroTik
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {Function} next - Next middleware
 */
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
        code: 'MIKROTIK_INACTIVE',
        details: `Mikrotik ${mikrotikValidacao.nome} está inativo`,
        source: 'API'
      };
    }

    // Verificar se o token corresponde
    if (mikrotikValidacao.api_token !== token) {
      throw {
        message: 'Token inválido',
        code: 'INVALID_TOKEN',
        details: 'O token fornecido não corresponde ao registrado',
        source: 'API'
      };
    }

    // Adicionar informações do MikroTik ao request
    req.mikrotik = mikrotikValidacao;
    req.mikrotik_id = finalMikrotikId;
    
    // Adicionar header para logs
    res.set('X-Mikrotik-ID', finalMikrotikId);
    
    console.log(`[${formatDateWithTimezone()}] [AUTH] Token válido para MikroTik: ${mikrotikValidacao.nome}`);
    
    next();
  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [AUTH] Erro na validação:`, error.message);
    next(error);
  }
}

module.exports = {
  validarTokenMikrotik
};