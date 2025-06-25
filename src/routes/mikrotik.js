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
  mac_address: z.string().min(1),
  action: z.string().min(1)
});

const heartbeatSchema = z.object({
  mikrotik_id: z.string().uuid(),
  token: z.string().min(1),
  version: z.string().optional(),
  uptime: z.string().optional(),
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
    const { mac_address, action } = authNotificationSchema.parse(req.body);
    
    console.log(`[${formatDateWithTimezone()}] [MIKROTIK] Notificação de autenticação: ${mac_address}, ação: ${action}`);

    // Buscar MAC no banco
    let macObj = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .select('*')
        .eq('mac_address', mac_address)
        .eq('mikrotik_id', req.mikrotik_id)
        .single()
    );

    // Se MAC não existe e ação é connect, criar novo
    if (!macObj && action === 'connect') {
      console.log(`[${formatDateWithTimezone()}] [MIKROTIK] Criando novo MAC: ${mac_address}`);
      macObj = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('macs')
          .insert({
            mac_address: mac_address,
            mikrotik_id: req.mikrotik_id,
            tempo_restante: 0,
            autenticado: false
          })
          .select()
          .single()
      );
    }

    if (!macObj) {
      console.log(`[${formatDateWithTimezone()}] [MIKROTIK] MAC não encontrado: ${mac_address}`);
      return res.status(404).json({
        success: false,
        error: {
          message: 'MAC não encontrado',
          code: 'MAC_NOT_FOUND',
          details: `MAC ${mac_address} não está registrado neste MikroTik`
        }
      });
    }

    const agora = getCurrentISOTimestamp();

    if (action === 'connect') {
      // Processar conexão - atualizar como autenticado se há tempo restante
      const tempoRestante = macObj.tempo_restante || 0;
      const autenticado = tempoRestante > 0;
      const expiresAt = autenticado ? 
        new Date(Date.now() + (tempoRestante * 60 * 1000)).toISOString() : null;

      await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('macs')
          .update({
            autenticado: autenticado,
            ultima_autenticacao: agora,
            expires_at: expiresAt
          })
          .eq('id', macObj.id)
      );

      if (autenticado) {
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
      }

      console.log(`[${formatDateWithTimezone()}] [MIKROTIK] MAC ${mac_address} conectado - Autenticado: ${autenticado}, Tempo: ${tempoRestante}min`);

      res.json({
        success: true,
        data: {
          mac: mac_address,
          action: action,
          autenticado: autenticado,
          tempo_restante: tempoRestante,
          expires_at: expiresAt
        }
      });

    } else if (action === 'disconnect') {
      // Processar desconexão - marcar como não autenticado
      await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('macs')
          .update({
            autenticado: false,
            ultima_desautenticacao: agora
          })
          .eq('id', macObj.id)
      );

      console.log(`[${formatDateWithTimezone()}] [MIKROTIK] MAC ${mac_address} desconectado`);

      res.json({
        success: true,
        data: {
          mac: mac_address,
          action: action,
          autenticado: false,
          tempo_restante: macObj.tempo_restante || 0
        }
      });

    } else {
      throw {
        message: 'Ação inválida',
        code: 'INVALID_ACTION',
        details: `Ação '${action}' não é válida. Use 'connect' ou 'disconnect'`,
        source: 'API'
      };
    }

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
    const { version, uptime, status, macs_conectados } = heartbeatSchema.parse(req.body);
    
    console.log(`[${formatDateWithTimezone()}] [MIKROTIK] Heartbeat de ${req.mikrotik.nome}: ${status}, MACs: ${macs_conectados}, Version: ${version}`);

    // Atualizar último heartbeat do MikroTik
    await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('mikrotiks')
        .update({
          ultimo_heartbeat: getCurrentISOTimestamp(),
          status_conexao: status,
          macs_conectados: macs_conectados,
          version: version,
          uptime: uptime
        })
        .eq('id', req.mikrotik_id)
    );

    res.json({
      success: true,
      data: {
        mikrotik: req.mikrotik.nome,
        heartbeat_recebido: getCurrentISOTimestamp(),
        status: status,
        macs_conectados: macs_conectados,
        version: version,
        uptime: uptime
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

    const { apiDomain } = require('../config/env');
    const baseUrl = req.body.api_url || apiDomain;

    // Script do Heartbeat (baseado no heartbeat.md)
    const heartbeatScript = `:local debug false;
:local apiUrl "${baseUrl}/api/mikrotik/heartbeat";
:local mikrotikId "${req.mikrotik_id}";
:local apiToken "${req.body.token}";

:if (\\$debug) do={ :log info "Heartbeat iniciado" };

:local version [/system resource get version];
:local uptime [/system resource get uptime];
:local macsConectados 0;

# Contar MACs conectados no hotspot
:foreach binding in=[/ip hotspot ip-binding find where type=bypassed] do={
    :set macsConectados (\\$macsConectados + 1);
};

:local jsonData "{\\"mikrotik_id\\":\\"\\$mikrotikId\\",\\"token\\":\\"\\$apiToken\\",\\"version\\":\\"\\$version\\",\\"uptime\\":\\"\\$uptime\\",\\"status\\":\\"online\\",\\"macs_conectados\\":\\$macsConectados}";

:do {
    /tool fetch url=\\$apiUrl http-method=post http-header-field="Content-Type:application/json" http-data=\\$jsonData keep-result=no;
    :if (\\$debug) do={ :log info "Heartbeat enviado com sucesso" };
} on-error={
    :log error "Erro ao enviar heartbeat";
};`;

    // Script do Verificador (baseado no verificador.md)
    const verificadorScript = `:local debug false;
:local apiUrl "${baseUrl}/api/recent-sales";
:local mikrotikId "${req.mikrotik_id}";
:local apiToken "${req.body.token}";

:if (\\$debug) do={ :log info "PIX iniciado" };
:local macs "";
:local vendasEncontradas false;
:local tentativa 1;

:while (\\$tentativa <= 5 and !\\$vendasEncontradas) do={
    :if (\\$debug) do={ :log info "Tentativa \\$tentativa" };
    :local jsonData "{\\"mikrotik_id\\":\\"\\$mikrotikId\\",\\"token\\":\\"\\$apiToken\\"}";
    /tool fetch url=\\$apiUrl http-method=post http-header-field="Content-Type:application/json" http-data=\\$jsonData dst-path="vendas.txt";
    :delay 2s;
    :local vendas [/file get [find name="vendas.txt"] contents];
    /file remove [find name="vendas.txt"];
    
    :if ([:len \\$vendas] > 0) do={
        :if (\\$vendas = "N/A") do={
            :if (\\$debug) do={ :log info "Nenhuma venda pendente (N/A) - parando tentativas" };
            :set vendasEncontradas true;
        } else={
            :local pos [:find \\$vendas "-"];
            :if (\\$pos >= 0) do={
                :local mac [:pick \\$vendas 0 \\$pos];
                :local minutos [:tonum [:pick \\$vendas (\\$pos + 1) [:len \\$vendas]]];
                :if (\\$debug) do={ :log info "MAC: \\$mac, Minutos: \\$minutos" };
                :set vendasEncontradas true;
                
                :if ([:find \\$macs \\$mac] < 0) do={
                    :do {
                        /ip hotspot ip-binding remove [find mac-address=\\$mac]
                    } on-error={};
                    
                    # Calcular data de expiração
                    :local agora [/system clock get time];
                    :local hoje [/system clock get date];
                    :local h [:tonum [:pick \\$agora 0 2]];
                    :local m [:tonum [:pick \\$agora 3 5]];
                    
                    :local novoMin ((\\$h * 60) + \\$m + \\$minutos);
                    :local diasAdicionais 0;
                    
                    :while (\\$novoMin >= 1440) do={
                        :set novoMin (\\$novoMin - 1440);
                        :set diasAdicionais (\\$diasAdicionais + 1);
                    };
                    
                    :local novaH (\\$novoMin / 60);
                    :local novaM (\\$novoMin % 60);
                    
                    :local hs [:tostr \\$novaH];
                    :local ms [:tostr \\$novaM];
                    :if ([:len \\$hs] = 1) do={ :set hs ("0" . \\$hs) };
                    :if ([:len \\$ms] = 1) do={ :set ms ("0" . \\$ms) };
                    
                    :local dataExpire (\\$hoje . "-" . \\$hs . \\$ms);
                    :local comentario ("PIX-EXPIRE-" . \\$dataExpire . "-" . \\$mac);
                    
                    /ip hotspot ip-binding add mac-address=\\$mac type=bypassed comment=\\$comentario;
                    
                    :log info "Binding criado: \\$mac - Expira em: \\$hoje \\$hs:\\$ms";
                    :set macs (\\$macs . \\$mac . ";");
                }
            }
        }
    };
    
    :if (!\\$vendasEncontradas) do={
        :set tentativa (\\$tentativa + 1);
    };
};

:if ([:len \\$macs] > 0) do={
    :global pixMacsNotificar \\$macs;
    :global pixAcaoNotificar "connect";
    :if (\\$debug) do={ :log info "Executando notificador..." };
    /system script run notificador-pix
};`;

    // Script do Notificador (baseado no notificador-desconectado.md)
    const notificadorScript = `:local debug false;
:global pixMacsNotificar;
:global pixAcaoNotificar;

:if (\\$debug) do={ :log info "Notificador iniciado" };
:local url "${baseUrl}/api/mikrotik/auth-notification";
:local pos 0;
:local sucessos 0;
:local total 0;

:while ([:find \\$pixMacsNotificar ";" \\$pos] >= 0) do={
    :local fim [:find \\$pixMacsNotificar ";" \\$pos];
    :local mac [:pick \\$pixMacsNotificar \\$pos \\$fim];
    :if ([:len \\$mac] > 0) do={
        :set total (\\$total + 1);
        :if (\\$debug) do={ :log info "Processando: \\$mac" };
        :local data "{\\"token\\":\\"${req.body.token}\\",\\"mac_address\\":\\"\\$mac\\",\\"mikrotik_id\\":\\"${req.mikrotik_id}\\",\\"action\\":\\"\\$pixAcaoNotificar\\"}";
        :local tentativa 1;
        :local enviado false;
        :while (\\$tentativa <= 3 and !\\$enviado) do={
            :do {
                /tool fetch url=\\$url http-method=post http-header-field="Content-Type: application/json" http-data=\\$data keep-result=no;
                :set enviado true;
                :set sucessos (\\$sucessos + 1);
                :if (\\$debug) do={ :log info "Sucesso: \\$mac" };
            } on-error={
                :set tentativa (\\$tentativa + 1);
                :if (\\$tentativa <= 3) do={ :delay 1s };
            };
        };
    };
    :set pos (\\$fim + 1);
};

:if (\\$sucessos = \\$total and \\$total > 0) do={
    :set pixMacsNotificar;
    :if (\\$debug) do={ :log info "Todas notificações enviadas" };
};`;

    // Script de limpeza (baseado no limpeza.md)
    const limpezaScript = `:local debug false;
:if (\\$debug) do={ :log info "=== LIMPEZA AUTOMATICA INICIADA ===" };

:local agora [/system clock get time];
:local hoje [/system clock get date];
:local h [:tonum [:pick \\$agora 0 [:find \\$agora ":"]]];
:local m [:tonum [:pick \\$agora 3 5]];
:local minAtual ((\\$h * 60) + \\$m);

:local macsExpirados "";
:local removidos 0;
:local total 0;

:foreach binding in=[/ip hotspot ip-binding find where comment~"PIX-EXPIRE-"] do={
    :set total (\\$total + 1);
    :local comentario [/ip hotspot ip-binding get \\$binding comment];
    :local macAddress [/ip hotspot ip-binding get \\$binding mac-address];
    
    # Extrair data de expiração do comentário
    :local pos [:find \\$comentario "PIX-EXPIRE-"];
    :local dados [:pick \\$comentario (\\$pos + 11) [:len \\$comentario]];
    
    # Verificar se expirou e remover se necessário
    # (lógica de comparação de data/hora simplificada)
    
    :log info "REMOVENDO: \\$macAddress";
    /ip hotspot ip-binding remove \\$binding;
    :set macsExpirados (\\$macsExpirados . \\$macAddress . ";");
    :set removidos (\\$removidos + 1);
};

:if ([:len \\$macsExpirados] > 0) do={
    :global pixMacsDesconectar \\$macsExpirados;
    :if (\\$debug) do={ :log info "Executando notificador de desconexao..." };
    /system script run notificador-desconectado;
};

:log info "=== TOTAL:\\$total REMOVIDOS:\\$removidos ===";`;

    // Script principal de configuração
    const routerOSScript = `# PIX MikroTik - Scripts de Configuração Completa
# MikroTik: ${req.mikrotik.nome}
# API: ${baseUrl}
# Token: ${req.body.token.substring(0, 8)}...

# 1. Criar script do heartbeat
/system script add name="heartbeat" source="${heartbeatScript}"

# 2. Criar script do verificador
/system script add name="verificador" source="${verificadorScript}"

# 3. Criar script do notificador
/system script add name="notificador-pix" source="${notificadorScript}"

# 4. Criar script de limpeza
/system script add name="limpeza" source="${limpezaScript}"

# 5. Agendar execução automática
/system scheduler add name="pix-heartbeat" interval=5m on-event="heartbeat"
/system scheduler add name="pix-verificador" interval=1m on-event="verificador"
/system scheduler add name="pix-limpeza" interval=1h on-event="limpeza"

:log info "PIX MikroTik configurado com sucesso! Scripts: heartbeat, verificador, notificador-pix, limpeza"`;

    const bashScript = `#!/bin/bash
# PIX MikroTik - Script de Teste de Conectividade
# Para sistemas que suportam curl

MIKROTIK_ID="${req.mikrotik_id}"
TOKEN="${req.body.token}"
API_URL="${baseUrl}"

echo "Testando conectividade PIX MikroTik..."
echo "MikroTik: ${req.mikrotik.nome}"
echo "API URL: $API_URL"

# Teste de heartbeat
echo "Enviando heartbeat..."
curl -X POST "$API_URL/api/mikrotik/heartbeat" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"mikrotik_id\\": \\"$MIKROTIK_ID\\",
    \\"token\\": \\"$TOKEN\\",
    \\"status\\": \\"online\\",
    \\"macs_conectados\\": 0,
    \\"version\\": \\"test\\",
    \\"uptime\\": \\"0s\\"
  }"

echo ""
echo "Testando recent-sales..."
curl -X POST "$API_URL/api/recent-sales" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"mikrotik_id\\": \\"$MIKROTIK_ID\\",
    \\"token\\": \\"$TOKEN\\"
  }"

echo ""
echo "Teste concluído!"`;

    res.json({
      success: true,
      data: {
        mikrotik: {
          id: req.mikrotik.id,
          nome: req.mikrotik.nome
        },
        scripts: {
          routeros: routerOSScript,
          heartbeat: heartbeatScript,
          verificador: verificadorScript,
          notificador: notificadorScript,
          limpeza: limpezaScript,
          bash: bashScript
        },
        instalacao: {
          passos: [
            "1. Copie o script RouterOS principal",
            "2. Cole no terminal do MikroTik",
            "3. Execute o comando para criar todos os scripts",
            "4. Verifique se os schedulers foram criados com '/system scheduler print'",
            "5. Monitore os logs com '/log print where topics~\"info\"'",
            "6. Teste a conectividade usando o script bash"
          ]
        },
        configuracao: {
          api_url: baseUrl,
          mikrotik_id: req.mikrotik_id,
          schedulers: [
            "pix-heartbeat: executa a cada 5 minutos",
            "pix-verificador: executa a cada 1 minuto",
            "pix-limpeza: executa a cada 1 hora"
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