const { createClient } = require('@supabase/supabase-js');
const { supabase: config } = require('../config/env');

// Inicialização do cliente Supabase
const supabaseAdmin = createClient(
  config.url,
  config.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * Manipula operações do Supabase com tratamento de erro centralizado
 * @param {Function} operation - Operação do Supabase
 * @returns {Promise<any>}
 */
async function handleSupabaseOperation(operation) {
  try {
    const { data, error } = await operation();
    
    if (error) {
      const errorObj = {
        message: error.message,
        code: error.code || 'DATABASE_ERROR',
        details: error.details || 'Erro na operação do banco de dados',
        source: 'SUPABASE'
      };
      throw errorObj;
    }
    
    return data;
  } catch (err) {
    if (err.source === 'SUPABASE') {
      throw err;
    }
    
    throw {
      message: 'Erro interno do banco de dados',
      code: 'INTERNAL_DATABASE_ERROR',
      details: err.message,
      source: 'SUPABASE'
    };
  }
}

/**
 * Incrementa saldo do admin
 * @param {number} valor - Valor a incrementar
 * @returns {Promise<void>}
 */
async function incrementarSaldoAdmin(valor) {
  return await supabaseAdmin.rpc('incrementar_saldo_admin', { valor });
}

/**
 * Incrementa saldo do cliente
 * @param {string} clienteId - ID do cliente
 * @param {number} valor - Valor a incrementar
 * @returns {Promise<void>}
 */
async function incrementarSaldoCliente(clienteId, valor) {
  return await supabaseAdmin.rpc('incrementar_saldo_cliente', { 
    cliente_id: clienteId, 
    valor 
  });
}

module.exports = {
  supabaseAdmin,
  handleSupabaseOperation,
  incrementarSaldoAdmin,
  incrementarSaldoCliente
};