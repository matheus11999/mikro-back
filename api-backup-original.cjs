const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Validação de variáveis de ambiente
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

const missingEnvVars = [];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    missingEnvVars.push(envVar);
  }
}

if (missingEnvVars.length > 0) {
  console.warn(`Aviso: Variáveis de ambiente não definidas: ${missingEnvVars.join(', ')}`);
  console.warn('A API pode não funcionar corretamente sem essas variáveis.');
}

// Inicialização do Supabase
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

// Middleware de autenticação por token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  // Token também pode vir no body ou query
  const bodyToken = req.body?.token;
  const queryToken = req.query?.token;
  
  const providedToken = token || bodyToken || queryToken;
  const expectedToken = process.env.API_ACCESS_TOKEN || 'api-secure-token-2024';
  
  if (!providedToken) {
    return res.status(401).json({
      error: 'Token de acesso obrigatório',
      code: 'NO_TOKEN',
      message: 'Forneça o token via header Authorization, body.token ou query.token'
    });
  }
  
  if (providedToken !== expectedToken) {
    return res.status(401).json({
      error: 'Token de acesso inválido',
      code: 'INVALID_TOKEN',
      message: 'Token fornecido não é válido'
    });
  }
  
  next();
};

app.use(logRequest);

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

// Middleware de erro global
const errorHandler = (err, req, res, next) => {
  console.error('Erro detalhado:', err);

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

  let status = 500;
  if (err.code === 'VALIDATION_ERROR') status = 400;
  if (err.code === 'NOT_FOUND') status = 404;
  if (err.code === 'UNAUTHORIZED') status = 401;
  if (err.code === 'FORBIDDEN') status = 403;

  res.status(status).json(errorResponse);
};

// Endpoint público para teste de acessibilidade da API
app.get('/api/captive-check', (req, res) => {
  res.json({ status: 'ok', message: 'API está funcionando!' });
});

// Endpoint para listar planos disponíveis (com autenticação)
app.post('/api/captive-check/planos', authenticateToken, async (req, res, next) => {
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

    // Retorna planos simplificados - sem verificação de senhas
    const planosFormatados = planos.map(plano => ({
      ...plano,
      disponivel: true // Sempre disponível no sistema simplificado
    }));

    return res.json({
      planos: planosFormatados,
      total: planosFormatados.length
    });

  } catch (err) {
    next(err);
  }
});

// Endpoint para verificar status do MAC (com autenticação)
app.post('/api/captive-check/status', authenticateToken, async (req, res, next) => {
  try {
    const { mac, mikrotik_id } = req.body;
    console.log('[STATUS] Recebido:', { mac, mikrotik_id });

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
            total_gasto: 0
          }])
          .select()
          .single()
      );
      macObj = novoMac;
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

    // Busca vendas do MAC
    const vendas = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('*')
        .eq('mac_cliente', mac)
        .eq('mikrotik_id', mikrotik_id)
        .order('created_at', { ascending: false })
    );

    // Estatísticas do MAC
    const totalVendas = vendas ? vendas.length : 0;
    const totalGasto = vendas ? vendas.reduce((acc, v) => acc + Number(v.valor || 0), 0) : 0;
    
    // Verifica se tem acesso válido (tempo não expirado)
    const agora = new Date();
    let acessoValido = null;
    
    if (vendas && vendas.length > 0) {
      for (const venda of vendas) {
        const dataVenda = new Date(venda.created_at);
        const fimAcesso = new Date(dataVenda.getTime() + venda.minutos_acesso * 60000);
        
        if (agora < fimAcesso) {
          acessoValido = venda;
          break;
        }
      }
    }

    if (acessoValido) {
      const dataVenda = new Date(acessoValido.created_at);
      const fimAcesso = new Date(dataVenda.getTime() + acessoValido.minutos_acesso * 60000);
      
      return res.json({
        status: 'autenticado',
        mac: macObj.mac_address,
        mikrotik_id: macObj.mikrotik_id,
        total_vendas: totalVendas,
        total_gasto: totalGasto,
        minutos_restantes: Math.max(0, Math.floor((fimAcesso - agora) / 60000)),
        fim_acesso: fimAcesso.toISOString(),
        plano_ativo: acessoValido.descricao || 'Acesso PIX'
      });
    }

    return res.json({
      status: 'precisa_comprar',
      mac: macObj.mac_address,
      mikrotik_id: macObj.mikrotik_id,
      total_vendas: totalVendas,
      total_gasto: totalGasto
    });

  } catch (err) {
    next(err);
  }
});

// Endpoint para obter vendas recentes (apenas MACs) - com autenticação
app.get('/api/recent-sales/:mikrotik_id', authenticateToken, async (req, res, next) => {
  try {
    const { mikrotik_id } = req.params;
    
    console.log(`Consultando vendas recentes para MikroTik: ${mikrotik_id}`);
    
    const { data: vendas, error } = await supabaseAdmin
      .from('vendas')
      .select(`
        id,
        mac_cliente,
        minutos_acesso,
        valor,
        created_at,
        macs!inner (
          id,
          mac_address,
          status,
          ultimo_acesso
        )
      `)
      .eq('mikrotik_id', mikrotik_id)
      .eq('macs.status', 'desconectado') // Apenas MACs desconectados
      .gte('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString()) // Últimos 2 minutos
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao consultar vendas:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        details: error.message 
      });
    }

    // Formato simplificado: apenas array de objetos com MAC e minutos
    const result = vendas.map(venda => ({
      mac: venda.macs.mac_address,
      minutos: venda.minutos_acesso
    }));

    console.log(`Encontradas ${vendas.length} vendas recentes. Retornando:`, result);
    
    res.json(result);
    
  } catch (error) {
    console.error('Erro inesperado:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
});

// Endpoint para receber notificações de autenticação do Mikrotik
app.post('/api/mikrotik/auth-notification', async (req, res, next) => {
  try {
    const { token, mac_address, mikrotik_id, action } = req.body;
    
    console.log('[MIKROTIK AUTH] Notificação recebida:', { 
      mac_address, 
      mikrotik_id, 
      action,
      timestamp: new Date().toISOString()
    });

    // Token de segurança
    const expectedToken = process.env.MIKROTIK_AUTH_TOKEN || 'mikrotik-secure-token-2024';
    
    if (!token || token !== expectedToken) {
      console.error('[MIKROTIK AUTH] Token inválido:', token);
      return res.status(401).json({
        error: 'Token de autorização inválido',
        code: 'UNAUTHORIZED',
        message: 'Token obrigatório e deve ser válido'
      });
    }

    // Validação de campos obrigatórios
    if (!mac_address || !mikrotik_id || !action) {
      throw {
        message: 'Campos obrigatórios ausentes',
        code: 'VALIDATION_ERROR',
        details: 'mac_address, mikrotik_id e action são obrigatórios',
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

    // Buscar MAC no banco de dados
    const macs = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .select('*')
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
            total_gasto: 0
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
        novoStatus = 'ativo';
    }

    console.log('[MIKROTIK AUTH] Atualizando status:', {
      mac: mac_address,
      statusAnterior: macObj.status,
      novoStatus,
      action
    });

    // Atualizar MAC no banco
    const macAtualizado = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .update({
          status: novoStatus,
          ultimo_acesso: agora
        })
        .eq('id', macObj.id)
        .select()
        .single()
    );

    console.log('[MIKROTIK AUTH] MAC atualizado com sucesso:', {
      id: macAtualizado.id,
      mac_address: macAtualizado.mac_address,
      status: macAtualizado.status,
      ultimo_acesso: macAtualizado.ultimo_acesso
    });

    return res.json({
      success: true,
      message: 'Autenticação registrada com sucesso',
      data: {
        mac_id: macAtualizado.id,
        mac_address: macAtualizado.mac_address,
        status_anterior: macObj.status,
        status_atual: macAtualizado.status,
        ultimo_acesso: macAtualizado.ultimo_acesso,
        action_processada: action
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
      action: 'Ação: login, logout, connect, disconnect, etc.'
    },
    example: {
      method: 'POST',
      url: '/api/mikrotik/auth-notification',
      body: {
        token: 'mikrotik-secure-token-2024',
        mac_address: '00:11:22:33:44:55',
        mikrotik_id: '78957cd3-7096-4acd-970b-0aa0a768c555',
        action: 'connect'
      }
    }
  });
});

// Endpoint protegido para estatísticas (com autenticação)
app.get('/api/stats/:mikrotik_id', authenticateToken, async (req, res, next) => {
  try {
    const { mikrotik_id } = req.params;
    
    const vendas = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('*')
        .eq('mikrotik_id', mikrotik_id)
        .order('created_at', { ascending: false })
    );

    const macs = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .select('*')
        .eq('mikrotik_id', mikrotik_id)
        .order('ultimo_acesso', { ascending: false })
    );

    const totalVendas = vendas ? vendas.length : 0;
    const totalArrecadado = vendas ? vendas.reduce((acc, v) => acc + Number(v.valor || 0), 0) : 0;
    const macsUnicos = macs ? macs.length : 0;
    const macsConectados = macs ? macs.filter(m => m.status === 'conectado').length : 0;

    res.json({
      mikrotik_id,
      total_vendas: totalVendas,
      total_arrecadado: totalArrecadado,
      macs_unicos: macsUnicos,
      macs_conectados: macsConectados,
      vendas_recentes: vendas ? vendas.slice(0, 10) : [],
      macs_recentes: macs ? macs.slice(0, 10) : []
    });

  } catch (err) {
    next(err);
  }
});

// Registra o middleware de erro
app.use(errorHandler);

const FRONTEND_BUILD_PATH = process.env.FRONTEND_BUILD_PATH || path.join(__dirname, 'dist');

// Servir frontend se existir
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
  console.log(`API disponível em: http://localhost:${port}/`);
  console.log('[SISTEMA SIMPLIFICADO] Trabalhando apenas com MACs - sem sistema de senhas');
}); 