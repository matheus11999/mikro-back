const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Configurações
const { port, apiDomain } = require('./config/env');
const { formatDateWithTimezone } = require('./utils/datetime');

// Middlewares
const { validarTokenMikrotik } = require('./middlewares/auth');

// Services
const { processarAprovacaoPagamento } = require('./services/payment');
const { calcularComissao } = require('./utils/calculations');

const app = express();

// Middlewares globais
app.use(express.json());
app.use(cors());

// Middleware de log
function logRequest(req, res, next) {
  const timestamp = formatDateWithTimezone();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
}

app.use(logRequest);

// Error handler centralizado
function errorHandler(error, req, res, next) {
  const timestamp = formatDateWithTimezone();
  
  console.error(`[${timestamp}] [ERROR] ${error.message}`);
  if (error.details) {
    console.error(`[${timestamp}] [ERROR] Detalhes: ${error.details}`);
  }

  const statusCode = error.code === 'UNAUTHORIZED' ? 401 :
                    error.code === 'NOT_FOUND' ? 404 :
                    error.code === 'VALIDATION_ERROR' ? 400 : 500;

  res.status(statusCode).json({
    success: false,
    error: {
      message: error.message,
      code: error.code || 'INTERNAL_ERROR',
      details: error.details || 'Erro interno do servidor',
      timestamp: timestamp
    }
  });
}

// ================================================================
// ROTAS BÁSICAS
// ================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: formatDateWithTimezone(),
    version: '1.1.0'
  });
});

// ================================================================
// IMPORTAR ROTAS MODULARES
// ================================================================

app.use('/api/captive-check', require('./routes/captive'));
app.use('/api/webhook', require('./routes/webhook'));
app.use('/api/mikrotik', require('./routes/mikrotik'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/templates', require('./routes/templates'));

// Rota específica para recent-sales (compatibilidade com scripts MikroTik)
app.post('/api/recent-sales', require('./middlewares/auth').validarTokenMikrotik, async (req, res, next) => {
  try {
    const { mikrotik_id } = req.body;
    
    console.log(`[${formatDateWithTimezone()}] [RECENT-SALES] Buscando vendas para: ${req.mikrotik.nome}`);

    // Buscar venda mais recente aprovada mas não processada
    const venda = await require('./services/database').handleSupabaseOperation(() =>
      require('./services/database').supabaseAdmin
        .from('vendas')
        .select('*, mac_id(*), plano_id(*)')
        .eq('mikrotik_id', mikrotik_id)
        .eq('status', 'aprovado')
        .eq('autenticado', false)
        .order('pagamento_aprovado_em', { ascending: false })
        .limit(1)
        .single()
    );

    if (!venda) {
      console.log(`[${formatDateWithTimezone()}] [RECENT-SALES] Nenhuma venda pendente encontrada`);
      // Retorna "N/A" conforme esperado pelo script MikroTik
      res.setHeader('Content-Type', 'text/plain');
      return res.send('N/A');
    }

    // Calcular tempo restante baseado na duração do plano
    const tempoRestante = venda.plano_duracao || venda.plano_id?.duracao || 60;
    const macAddress = venda.mac_id?.mac_address;

    if (!macAddress) {
      console.log(`[${formatDateWithTimezone()}] [RECENT-SALES] MAC address não encontrado para venda ${venda.id}`);
      res.setHeader('Content-Type', 'text/plain');
      return res.send('N/A');
    }

    // Atualizar MAC com tempo restante
    await require('./services/database').handleSupabaseOperation(() =>
      require('./services/database').supabaseAdmin
        .from('macs')
        .update({
          tempo_restante: tempoRestante,
          ultima_atualizacao: require('./utils/datetime').getCurrentISOTimestamp()
        })
        .eq('id', venda.mac_id.id)
    );

    // Formato esperado pelo script: "MAC-MINUTOS"
    const resposta = `${macAddress}-${tempoRestante}`;
    
    console.log(`[${formatDateWithTimezone()}] [RECENT-SALES] Retornando: ${resposta}`);
    
    res.setHeader('Content-Type', 'text/plain');
    res.send(resposta);

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [RECENT-SALES] Erro:`, error.message);
    // Em caso de erro, retornar N/A para não quebrar o script
    res.setHeader('Content-Type', 'text/plain');
    res.send('N/A');
  }
});

// ================================================================
// MIDDLEWARE DE ERRO
// ================================================================

app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Endpoint não encontrado',
      code: 'NOT_FOUND',
      details: `A rota ${req.method} ${req.path} não existe`,
      timestamp: formatDateWithTimezone()
    }
  });
});

app.use(errorHandler);

// ================================================================
// INICIALIZAÇÃO DO SERVIDOR
// ================================================================

function startServer() {
  app.listen(port, () => {
    console.log('='.repeat(50));
    console.log(`🚀 PIX MIKRO API - Servidor iniciado`);
    console.log(`📡 API local: http://localhost:${port}/`);
    console.log(`🌐 Domínio público: ${apiDomain}`);
    console.log(`🏥 Health check: ${apiDomain}/health`);
    console.log(`📞 Webhook URL: ${apiDomain}/api/webhook/mercadopago`);
    console.log(`🔒 Middleware de segurança ativo`);
    console.log(`💳 Webhook Mercado Pago configurado`);
    console.log(`💓 Sistema de heartbeat MikroTik ativo`);
    console.log(`⚡ Sistema de cálculo de comissões corrigido`);
    console.log('='.repeat(50));
  });
}

module.exports = { app, startServer };