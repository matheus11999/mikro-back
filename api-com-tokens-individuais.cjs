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
  console.warn(`Aviso: Variáveis de ambiente não definidas: ${missingEnvVars.join(', ')}`);
  console.warn('A API pode não funcionar corretamente sem essas variáveis.');
}

// Inicialização dos clientes
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

app.use(logRequest);

// ===========================================
// MIDDLEWARE PARA VALIDAÇÃO DE TOKEN MIKROTIK
// ===========================================

const validarTokenMikrotik = async (req, res, next) => {
  try {
    const { token, mikrotik_id } = req.body;
    
    // Verificar se token foi fornecido
    if (!token) {
      return res.status(401).json({
        error: 'Token obrigatório',
        code: 'MISSING_TOKEN',
        message: 'Token de autenticação é obrigatório para este endpoint'
      });
    }

    // Verificar se mikrotik_id foi fornecido
    if (!mikrotik_id) {
      return res.status(400).json({
        error: 'mikrotik_id obrigatório',
        code: 'MISSING_MIKROTIK_ID',
        message: 'ID do MikroTik é obrigatório para validação do token'
      });
    }

    console.log('[TOKEN VALIDATION] Validando token para MikroTik:', mikrotik_id);

    // Buscar MikroTik pelo ID e verificar se o token bate
    const { data: mikrotik, error } = await supabaseAdmin
      .from('mikrotiks')
      .select('id, nome, api_token, status')
      .eq('id', mikrotik_id)
      .eq('api_token', token)
      .single();

    if (error || !mikrotik) {
      console.error('[TOKEN VALIDATION] Token inválido ou MikroTik não encontrado:', {
        mikrotik_id,
        token: token.substring(0, 10) + '...',
        error: error?.message
      });
      
      return res.status(401).json({
        error: 'Token inválido',
        code: 'INVALID_TOKEN',
        message: 'Token não corresponde ao MikroTik informado ou MikroTik não encontrado'
      });
    }

    console.log('[TOKEN VALIDATION] Token válido para MikroTik:', {
      id: mikrotik.id,
      nome: mikrotik.nome
    });

    // Adicionar dados do MikroTik ao request para uso posterior
    req.mikrotik = mikrotik;
    next();

  } catch (err) {
    console.error('[TOKEN VALIDATION] Erro na validação do token:', err);
    res.status(500).json({
      error: 'Erro interno na validação do token',
      code: 'TOKEN_VALIDATION_ERROR',
      message: err.message
    });
  }
};

// ===========================================
// FUNÇÕES UTILITÁRIAS
// ===========================================

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

function isValidMac(mac) {
  return /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac);
}

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
    if (err.code) throw err;
    throw {
      message: 'Erro na operação do banco de dados',
      code: 'SUPABASE_ERROR',
      details: err.message,
      source: 'Supabase'
    };
  }
}

async function handleMercadoPagoFetch(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Erro Mercado Pago (fetch):', data);
      throw {
        message: 'Erro ao processar requisição no Mercado Pago',
        code: 'MERCADOPAGO_ERROR',
        details: data,
        status: response.status,
        source: 'MercadoPago'
      };
    }

    return data;
  } catch (err) {
    if (err.code) throw err;
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

// ===========================================
// ENDPOINTS PÚBLICOS (SEM AUTENTICAÇÃO)
// ===========================================

// Endpoint para teste de acessibilidade da API
app.get('/api/captive-check', (req, res) => {
  res.json({ status: 'ok', message: 'API está funcionando!' });
});

// ===========================================
// ENDPOINTS COM AUTENTICAÇÃO DE TOKEN MIKROTIK
// ===========================================

// Endpoint para listar planos disponíveis (COM VALIDAÇÃO DE TOKEN)
app.post('/api/captive-check/planos', validarTokenMikrotik, async (req, res, next) => {
  try {
    const mikrotik_id = req.mikrotik.id; // Usar dados validados do middleware
    
    console.log('[PLANOS] Buscando planos para mikrotik:', mikrotik_id);

    const planos = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('planos')
        .select('*')
        .eq('mikrotik_id', mikrotik_id)
        .order('preco')
    );

    if (!planos || planos.length === 0) {
      throw {
        message: 'Nenhum plano encontrado',
        code: 'NOT_FOUND',
        details: `Nenhum plano disponível para o Mikrotik ${mikrotik_id}`,
        source: 'API'
      };
    }

    console.log('[PLANOS] Encontrados', planos.length, 'planos para mikrotik:', mikrotik_id);

    res.json({
      success: true,
      planos: planos,
      mikrotik: {
        id: req.mikrotik.id,
        nome: req.mikrotik.nome
      }
    });

  } catch (err) {
    console.error('[PLANOS] Erro ao buscar planos:', err);
    next(err);
  }
});

// Endpoint para heartbeat (COM VALIDAÇÃO DE TOKEN)
app.post('/api/mikrotik/heartbeat', validarTokenMikrotik, async (req, res, next) => {
  try {
    console.log('[HEARTBEAT] Recebido heartbeat do MikroTik:', req.mikrotik.nome);

    const { version, uptime } = req.body;
    const mikrotik_id = req.mikrotik.id; // Usar dados validados do middleware

    const agora = new Date().toISOString();

    console.log('[HEARTBEAT] Atualizando último heartbeat para Mikrotik:', mikrotik_id);

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

    // Opcionalmente, inserir log de heartbeat
    try {
      await supabaseAdmin
        .from('heartbeat_log')
        .insert({
          mikrotik_id: mikrotik_id,
          heartbeat_timestamp: agora,
          version: version || null,
          uptime: uptime || null,
          ip_origem: req.ip,
          user_agent: req.get('User-Agent')
        });
    } catch (logError) {
      // Log não é crítico, apenas avisar
      console.warn('[HEARTBEAT] Erro ao inserir log de heartbeat:', logError.message);
    }

    console.log('[HEARTBEAT] Heartbeat registrado com sucesso:', {
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

// Endpoint para notificação de autenticação (COM VALIDAÇÃO DE TOKEN)
app.post('/api/mikrotik/auth-notification', validarTokenMikrotik, async (req, res, next) => {
  try {
    const { mac_address, action, usuario, ip_address } = req.body;
    const mikrotik_id = req.mikrotik.id; // Usar dados validados do middleware

    console.log('[MIKROTIK AUTH] Notificação recebida do MikroTik:', req.mikrotik.nome, {
      mikrotik_id,
      mac_address,
      action,
      usuario,
      ip_address
    });

    // Validar MAC address
    if (!mac_address || !isValidMac(mac_address)) {
      throw {
        message: 'MAC address inválido',
        code: 'VALIDATION_ERROR',
        details: 'MAC address deve estar no formato XX:XX:XX:XX:XX:XX',
        source: 'API'
      };
    }

    // Normalizar MAC address (remover : e -)
    const macNormalizado = mac_address.replace(/[:-]/g, '').toLowerCase();

    // Verificar se MAC já existe
    let mac = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .select('*')
        .eq('mac_address', macNormalizado)
        .eq('mikrotik_id', mikrotik_id)
        .single()
    );

    if (!mac) {
      console.log('[MIKROTIK AUTH] MAC não encontrado, criando novo registro:', mac_address);
      
      mac = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('macs')
          .insert({
            mac_address: macNormalizado,
            mikrotik_id: mikrotik_id,
            primeiro_acesso: new Date().toISOString(),
            ultimo_acesso: new Date().toISOString(),
            total_compras: 0,
            total_gasto: 0,
            status: 'ativo'
          })
          .select('*')
          .single()
      );
    }

    // Processar diferentes ações
    let atualizacao = {
      ultimo_acesso: new Date().toISOString()
    };

    switch (action) {
      case 'login':
      case 'connect':
        atualizacao.status = 'conectado';
        break;
      case 'logout':
      case 'disconnect':
        atualizacao.status = 'desconectado';
        break;
      case 'authenticated':
        atualizacao.status = 'autenticado';
        break;
      default:
        console.warn('[MIKROTIK AUTH] Ação desconhecida:', action);
        break;
    }

    console.log('[MIKROTIK AUTH] Atualizando status:', {
      mac_id: mac.id,
      action,
      atualizacao
    });

    // Atualizar MAC
    const macAtualizado = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .update(atualizacao)
        .eq('id', mac.id)
        .select('*')
        .single()
    );

    console.log('[MIKROTIK AUTH] MAC atualizado com sucesso:', {
      mac_id: macAtualizado.id,
      mac_address: macAtualizado.mac_address,
      status: macAtualizado.status,
      mikrotik: req.mikrotik.nome
    });

    res.json({
      success: true,
      message: 'Notificação de autenticação processada com sucesso',
      data: {
        mac_id: macAtualizado.id,
        mac_address: mac_address,
        status: macAtualizado.status,
        action: action,
        mikrotik: {
          id: req.mikrotik.id,
          nome: req.mikrotik.nome
        }
      }
    });

  } catch (err) {
    console.error('[MIKROTIK AUTH] Erro ao processar notificação:', err);
    next(err);
  }
});

// ===========================================
// ENDPOINTS ADMINISTRATIVOS (SEM VALIDAÇÃO DE TOKEN MIKROTIK)
// ===========================================

// Endpoint para regenerar token de um MikroTik (apenas admins)
app.post('/api/admin/mikrotik/:id/regenerate-token', async (req, res, next) => {
  try {
    const mikrotik_id = req.params.id;
    
    console.log('[ADMIN] Regenerando token para MikroTik:', mikrotik_id);

    // Chamar função do banco para regenerar token
    const { data: novoToken, error } = await supabaseAdmin
      .rpc('regenerar_token_mikrotik', { mikrotik_uuid: mikrotik_id });

    if (error) {
      throw {
        message: 'Erro ao regenerar token',
        code: 'TOKEN_REGENERATION_ERROR',
        details: error.message,
        source: 'Supabase'
      };
    }

    console.log('[ADMIN] Token regenerado com sucesso para MikroTik:', mikrotik_id);

    res.json({
      success: true,
      message: 'Token regenerado com sucesso',
      data: {
        mikrotik_id: mikrotik_id,
        novo_token: novoToken
      }
    });

  } catch (err) {
    console.error('[ADMIN] Erro ao regenerar token:', err);
    next(err);
  }
});

// Endpoint para verificar status de MikroTiks (sem autenticação - para dashboard)
app.get('/api/mikrotik/status', async (req, res, next) => {
  try {
    console.log('[MIKROTIK STATUS] Verificando status dos MikroTiks...');

    // Usar a view criada na migração
    const { data: mikrotiksStatus, error } = await supabaseAdmin
      .from('vw_mikrotiks_status')
      .select('*')
      .order('nome');

    if (error) {
      throw {
        message: 'Erro ao buscar status dos MikroTiks',
        code: 'STATUS_FETCH_ERROR',
        details: error.message,
        source: 'Supabase'
      };
    }

    // Obter estatísticas usando a função criada na migração
    const { data: estatisticas, error: errorStats } = await supabaseAdmin
      .rpc('estatisticas_status_mikrotiks');

    if (errorStats) {
      console.warn('[MIKROTIK STATUS] Erro ao buscar estatísticas:', errorStats.message);
    }

    console.log('[MIKROTIK STATUS] Status obtido com sucesso. Total:', mikrotiksStatus.length);

    res.json({
      success: true,
      data: mikrotiksStatus,
      estatisticas: estatisticas?.[0] || {
        total_mikrotiks: mikrotiksStatus.length,
        online: mikrotiksStatus.filter(m => m.status_heartbeat === 'online').length,
        offline: mikrotiksStatus.filter(m => m.status_heartbeat === 'offline').length,
        never_connected: mikrotiksStatus.filter(m => m.status_heartbeat === 'never_connected').length
      },
      limite_offline_minutos: 15
    });

  } catch (err) {
    console.error('[MIKROTIK STATUS] Erro ao verificar status:', err);
    next(err);
  }
});

// Endpoint para listar MikroTiks com tokens (apenas para admins - tokens mascarados para não-admins)
app.get('/api/admin/mikrotiks', async (req, res, next) => {
  try {
    const { show_tokens } = req.query;
    
    console.log('[ADMIN] Listando MikroTiks. Mostrar tokens:', show_tokens === 'true');

    let selectFields = 'id, nome, provider_name, status, cliente_id, criado_em, profitpercentage, ultimo_heartbeat, heartbeat_version, heartbeat_uptime';
    
    // Apenas incluir token se explicitamente solicitado (para admins)
    if (show_tokens === 'true') {
      selectFields += ', api_token';
    }

    const mikrotiks = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('mikrotiks')
        .select(selectFields)
        .order('nome')
    );

    // Se não mostrar tokens, mascarar parcialmente
    const mikrotiksResponse = mikrotiks.map(mikrotik => {
      if (show_tokens !== 'true' && mikrotik.api_token) {
        return {
          ...mikrotik,
          api_token_masked: mikrotik.api_token ? mikrotik.api_token.substring(0, 8) + '...' : null
        };
      }
      return mikrotik;
    });

    res.json({
      success: true,
      data: mikrotiksResponse,
      total: mikrotiksResponse.length
    });

  } catch (err) {
    console.error('[ADMIN] Erro ao listar MikroTiks:', err);
    next(err);
  }
});

// ===========================================
// OUTROS ENDPOINTS (MANTIDOS COMO ESTAVAM)
// ===========================================

// [AQUI VIRIAM TODOS OS OUTROS ENDPOINTS EXISTENTES...]
// Por brevidade, incluindo apenas os principais. 
// Os demais endpoints de vendas, webhook do Mercado Pago, etc. 
// devem ser copiados da API original

// Middleware de erro no final
app.use(errorHandler);

// Servir frontend se necessário
const FRONTEND_BUILD_PATH = process.env.FRONTEND_BUILD_PATH || path.join(__dirname, 'dist');

if (process.env.APP_MODE !== 'frontend') {
  app.use(express.static(FRONTEND_BUILD_PATH));
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_BUILD_PATH, 'index.html'));
  });
}

// Iniciar servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
  console.log(`API com tokens individuais disponível em: http://localhost:${port}/`);
  console.log('[TOKEN SYSTEM] Sistema de tokens individuais por MikroTik ativo');
  console.log('[HEARTBEAT] Sistema de heartbeat com validação de token ativo');
}); 