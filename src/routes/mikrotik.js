const express = require('express');
const { z } = require('zod');

const { supabaseAdmin, handleSupabaseOperation } = require('../services/database');
const { validarTokenMikrotik } = require('../middlewares/auth');
const { formatDateWithTimezone, getCurrentISOTimestamp } = require('../utils/datetime');

const router = express.Router();

// Schemas de validação
const recentSalesSchema = z.object({
  mikrotik_id: z.string().uuid(),
  token: z.string().min(1),
  limit: z.number().min(1).max(100).optional().default(10)
});

const authNotificationSchema = z.object({
  mikrotik_id: z.string().uuid(),
  token: z.string().min(1),
  mac: z.string().min(1),
  tempo_restante: z.number().min(0)
});

const heartbeatSchema = z.object({
  mikrotik_id: z.string().uuid(),
  token: z.string().min(1),
  status: z.string().optional().default('online'),
  macs_conectados: z.number().min(0).optional().default(0)
});

const installScriptsSchema = z.object({
  mikrotik_id: z.string().uuid(),
  token: z.string().min(1)
});

// ================================================================
// ROTAS DO MIKROTIK
// ================================================================

/**
 * POST /api/mikrotik/recent-sales
 * Lista vendas recentes de um MikroTik (AUTENTICADO)
 */
router.post('/recent-sales', validarTokenMikrotik, async (req, res, next) => {
  try {
    const { mikrotik_id, limit } = recentSalesSchema.parse(req.body);
    
    console.log(`[${formatDateWithTimezone()}] [MIKROTIK] Listando ${limit} vendas recentes para: ${req.mikrotik.nome}`);

    // Buscar vendas recentes do MikroTik
    const vendas = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select(`
          id,
          valor,
          preco,
          status,
          data,
          pagamento_aprovado_em,
          plano_nome,
          plano_duracao,
          mac_id(mac_address),
          valor_creditado_cliente
        `)
        .eq('mikrotik_id', mikrotik_id)
        .order('data', { ascending: false })
        .limit(limit)
    );

    // Calcular estatísticas
    const vendasAprovadas = vendas.filter(v => v.status === 'aprovado');
    const totalVendas = vendasAprovadas.length;
    const valorTotal = vendasAprovadas.reduce((sum, v) => sum + (v.valor || v.preco || 0), 0);
    const valorCliente = vendasAprovadas.reduce((sum, v) => sum + (v.valor_creditado_cliente || 0), 0);

    console.log(`[${formatDateWithTimezone()}] [MIKROTIK] ${totalVendas} vendas aprovadas encontradas`);

    res.json({
      success: true,
      data: {
        vendas: vendas.map(venda => ({
          id: venda.id,
          valor: venda.valor || venda.preco,
          status: venda.status,
          data: venda.data,
          aprovado_em: venda.pagamento_aprovado_em,
          plano: venda.plano_nome,
          duracao: venda.plano_duracao,
          mac: venda.mac_id?.mac_address,
          valor_cliente: venda.valor_creditado_cliente
        })),
        estatisticas: {
          total_vendas: totalVendas,
          valor_total: valorTotal,
          valor_cliente: valorCliente,
          valor_admin: valorTotal - valorCliente
        },
        mikrotik: {
          id: req.mikrotik.id,
          nome: req.mikrotik.nome
        }
      }
    });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [MIKROTIK] Erro ao listar vendas:`, error.message);
    next(error);
  }
});

/**
 * POST /api/mikrotik/auth-notification
 * Notifica autenticação de usuário no MikroTik (AUTENTICADO)
 */
router.post('/auth-notification', validarTokenMikrotik, async (req, res, next) => {
  try {
    const { mac, tempo_restante } = authNotificationSchema.parse(req.body);
    
    console.log(`[${formatDateWithTimezone()}] [MIKROTIK] Notificação de autenticação: ${mac}, tempo: ${tempo_restante}min`);

    // Buscar MAC no banco
    const macObj = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .select('*')
        .eq('mac_address', mac)
        .eq('mikrotik_id', req.mikrotik_id)
        .single()
    );

    if (!macObj) {
      console.log(`[${formatDateWithTimezone()}] [MIKROTIK] MAC não encontrado: ${mac}`);
      return res.status(404).json({
        success: false,
        error: {
          message: 'MAC não encontrado',
          code: 'MAC_NOT_FOUND',
          details: `MAC ${mac} não está registrado neste MikroTik`
        }
      });
    }

    // Atualizar MAC com tempo restante e status autenticado
    const agora = getCurrentISOTimestamp();
    const expiresAt = new Date(Date.now() + (tempo_restante * 60 * 1000)).toISOString();

    await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .update({
          tempo_restante: tempo_restante,
          autenticado: tempo_restante > 0,
          ultima_autenticacao: agora,
          expires_at: expiresAt
        })
        .eq('id', macObj.id)
    );

    // Marcar vendas relacionadas como autenticadas
    await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .update({
          autenticado: true,
          ultima_atualizacao_status: agora
        })
        .eq('mac_id', macObj.id)
        .eq('status', 'aprovado')
    );

    console.log(`[${formatDateWithTimezone()}] [MIKROTIK] MAC ${mac} autenticado com sucesso`);

    res.json({
      success: true,
      data: {
        mac: mac,
        tempo_restante: tempo_restante,
        autenticado: tempo_restante > 0,
        expires_at: expiresAt
      }
    });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [MIKROTIK] Erro na notificação de autenticação:`, error.message);
    next(error);
  }
});

/**
 * GET /api/mikrotik/auth-notification/test
 * Endpoint de teste para notificação de autenticação
 */
router.get('/auth-notification/test', (req, res) => {
  console.log(`[${formatDateWithTimezone()}] [MIKROTIK] Teste de notificação de autenticação`);
  
  res.json({
    success: true,
    message: 'Endpoint de notificação de autenticação funcionando',
    timestamp: formatDateWithTimezone(),
    exemplo_payload: {
      mikrotik_id: 'uuid-do-mikrotik',
      token: 'token-de-autenticacao',
      mac: '00:11:22:33:44:55',
      tempo_restante: 60
    }
  });
});

/**
 * POST /api/mikrotik/heartbeat
 * Sistema de heartbeat para manter conexão (AUTENTICADO)
 */
router.post('/heartbeat', validarTokenMikrotik, async (req, res, next) => {
  try {
    const { status, macs_conectados } = heartbeatSchema.parse(req.body);
    
    console.log(`[${formatDateWithTimezone()}] [MIKROTIK] Heartbeat de ${req.mikrotik.nome}: ${status}, MACs: ${macs_conectados}`);

    // Atualizar último heartbeat do MikroTik
    await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('mikrotiks')
        .update({
          ultimo_heartbeat: getCurrentISOTimestamp(),
          status_conexao: status,
          macs_conectados: macs_conectados
        })
        .eq('id', req.mikrotik_id)
    );

    res.json({
      success: true,
      data: {
        mikrotik: req.mikrotik.nome,
        heartbeat_recebido: getCurrentISOTimestamp(),
        status: status,
        macs_conectados: macs_conectados
      }
    });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [MIKROTIK] Erro no heartbeat:`, error.message);
    next(error);
  }
});

/**
 * GET /api/mikrotik/status
 * Status geral dos MikroTiks
 */
router.get('/status', async (req, res, next) => {
  try {
    console.log(`[${formatDateWithTimezone()}] [MIKROTIK] Consultando status geral dos MikroTiks`);

    // Buscar todos os MikroTiks com informações de status
    const mikrotiks = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('mikrotiks')
        .select(`
          id,
          nome,
          status,
          ultimo_heartbeat,
          status_conexao,
          macs_conectados,
          profitpercentage
        `)
        .order('nome')
    );

    // Calcular status de conexão baseado no último heartbeat
    const agora = new Date();
    const mikrotiksComStatus = mikrotiks.map(mk => {
      const ultimoHeartbeat = mk.ultimo_heartbeat ? new Date(mk.ultimo_heartbeat) : null;
      const minutosOffline = ultimoHeartbeat ? 
        Math.floor((agora - ultimoHeartbeat) / (1000 * 60)) : null;
      
      const conexaoStatus = !ultimoHeartbeat ? 'nunca_conectado' :
                           minutosOffline > 10 ? 'offline' :
                           minutosOffline > 5 ? 'instavel' : 'online';

      return {
        ...mk,
        minutos_offline: minutosOffline,
        conexao_status: conexaoStatus,
        ultimo_heartbeat_formatado: ultimoHeartbeat ? 
          formatDateWithTimezone(ultimoHeartbeat) : null
      };
    });

    // Estatísticas gerais
    const totalMikrotiks = mikrotiksComStatus.length;
    const onlineMikrotiks = mikrotiksComStatus.filter(mk => mk.conexao_status === 'online').length;
    const ativosMikrotiks = mikrotiksComStatus.filter(mk => mk.status === 'Ativo').length;

    console.log(`[${formatDateWithTimezone()}] [MIKROTIK] ${onlineMikrotiks}/${totalMikrotiks} MikroTiks online`);

    res.json({
      success: true,
      data: {
        mikrotiks: mikrotiksComStatus,
        estatisticas: {
          total: totalMikrotiks,
          online: onlineMikrotiks,
          offline: totalMikrotiks - onlineMikrotiks,
          ativos: ativosMikrotiks,
          inativos: totalMikrotiks - ativosMikrotiks
        },
        timestamp: formatDateWithTimezone()
      }
    });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [MIKROTIK] Erro ao consultar status:`, error.message);
    next(error);
  }
});

/**
 * POST /api/mikrotik/install-scripts
 * Retorna scripts para instalação automática (AUTENTICADO)
 */
router.post('/install-scripts', validarTokenMikrotik, async (req, res, next) => {
  try {
    console.log(`[${formatDateWithTimezone()}] [MIKROTIK] Gerando scripts de instalação para: ${req.mikrotik.nome}`);

    // Script básico do RouterOS
    const routerOSScript = `
# PIX MikroTik - Script de Configuração Automática
# MikroTik: ${req.mikrotik.nome}
# Token: ${req.body.token.substring(0, 8)}...

# Configurar captive portal
/ip hotspot profile
add dns-name="wifi.local" hotspot-address=192.168.1.1 html-directory=hotspot name="pix-mikro-profile"

# Configurar redirecionamento
/ip hotspot
add address-pool=dhcp-pool1 disabled=no interface=bridge name="pix-mikro" profile="pix-mikro-profile"

# Script de notificação (executar quando usuário se conecta)
/system scheduler
add comment="PIX MikroTik Heartbeat" interval=5m name="pix-heartbeat" on-event="/tool fetch url=\"${req.body.api_url || 'https://api.lucro.top'}/api/mikrotik/heartbeat\" http-method=post http-data=\"{\\\"mikrotik_id\\\":\\\"${req.mikrotik_id}\\\",\\\"token\\\":\\\"${req.body.token}\\\",\\\"status\\\":\\\"online\\\"}\" http-header-field=\"Content-Type: application/json\" as-value"

# Configurar notificação de autenticação
/ip hotspot on-login
{
  /tool fetch url="${req.body.api_url || 'https://api.lucro.top'}/api/mikrotik/auth-notification" http-method=post http-data="{\\"mikrotik_id\\":\\"${req.mikrotik_id}\\",\\"token\\":\\"${req.body.token}\\",\\"mac\\":\\"$mac\\",\\"tempo_restante\\":60}" http-header-field="Content-Type: application/json" as-value
}

:log info "PIX MikroTik configurado com sucesso!"
`;

    const bashScript = `#!/bin/bash
# PIX MikroTik - Script de Configuração Linux/Bash
# Para sistemas que suportam curl

MIKROTIK_ID="${req.mikrotik_id}"
TOKEN="${req.body.token}"
API_URL="${req.body.api_url || 'https://api.lucro.top'}"

echo "Configurando PIX MikroTik..."
echo "MikroTik: ${req.mikrotik.nome}"
echo "API URL: $API_URL"

# Teste de conectividade
curl -X POST "$API_URL/api/mikrotik/heartbeat" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"mikrotik_id\\": \\"$MIKROTIK_ID\\",
    \\"token\\": \\"$TOKEN\\",
    \\"status\\": \\"online\\",
    \\"macs_conectados\\": 0
  }"

echo "Configuração concluída!"
`;

    res.json({
      success: true,
      data: {
        mikrotik: {
          id: req.mikrotik.id,
          nome: req.mikrotik.nome
        },
        scripts: {
          routeros: routerOSScript,
          bash: bashScript
        },
        instalacao: {
          passos: [
            "1. Copie o script RouterOS apropriado",
            "2. Cole no terminal do MikroTik",
            "3. Execute o comando",
            "4. Verifique os logs para confirmação",
            "5. Teste o heartbeat usando o endpoint /api/mikrotik/status"
          ]
        },
        timestamp: formatDateWithTimezone()
      }
    });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [MIKROTIK] Erro ao gerar scripts:`, error.message);
    next(error);
  }
});

module.exports = router;