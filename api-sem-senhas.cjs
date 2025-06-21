const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Configuração Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://phhcgvkbifghhugfnjni.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoaGNndmtiaWZnaGh1Z2Zuam5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM0Mjg0OTcsImV4cCI6MjA0OTAwNDQ5N30.cMCnK4TqnSSfvkfLHoQ0YXGy8gWOLl3PUeqkWh5xJjo';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoaGNndmtiaWZnaGh1Z2Zuam5pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMzQyODQ5NywiZXhwIjoyMDQ5MDA0NDk3fQ.kG-FmJPx3YEfwEkkOhMC_JGp0RYm4a-9e8hSDJGCCTQ';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Mercado Pago
const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || 'APP_USR-7001074116306513-112611-3d06b22e67e6aeb98bc7b8eae85e4e14-2128963584';

// Funções auxiliares
const isValidMac = (mac) => {
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  return macRegex.test(mac);
};

const handleSupabaseOperation = async (operation) => {
  const { data, error } = await operation();
  if (error) throw error;
  return data;
};

const handleMercadoPagoFetch = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  
  return await response.json();
};

// Middleware de tratamento de erros
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.code === 'VALIDATION_ERROR') {
    return res.status(400).json({
      error: err.message,
      code: err.code,
      details: err.details
    });
  }
  
  if (err.code === 'NOT_FOUND') {
    return res.status(404).json({
      error: err.message,
      code: err.code
    });
  }
  
  res.status(500).json({
    error: 'Erro interno do servidor',
    code: 'INTERNAL_ERROR',
    message: err.message
  });
};

app.use(errorHandler);

// ENDPOINTS

// 1. Listar planos (sem verificação de senhas)
app.get('/api/planos', async (req, res, next) => {
  try {
    const planos = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('planos')
        .select('*')
        .order('preco', { ascending: true })
    );

    // Sistema sem senhas - todos os planos estão sempre disponíveis
    const planosFormatados = planos.map(plano => ({
      ...plano,
      disponivel: true // Sistema baseado apenas em MAC
    }));

    return res.json({
      planos: planosFormatados,
      total: planosFormatados.length
    });

  } catch (err) {
    next(err);
  }
});

// 2. Status do MAC
app.post('/api/captive-check/status', async (req, res, next) => {
  try {
    const { mac, mikrotik_id, plano_id } = req.body;
    console.log('[STATUS] Recebido:', { mac, mikrotik_id, plano_id });

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
            status: 'desconectado',
            primeiro_acesso: new Date().toISOString(),
            ultimo_acesso: null,
            total_compras: 0,
            ultimo_plano: '',
            ultimo_valor: 0,
            total_gasto: 0,
            status_pagamento: 'aguardando',
            pagamento_aprovado_em: null
          }])
          .select()
          .single()
      );
      macObj = novoMac;
      return res.json({
        status: 'precisa_comprar',
        mac: macObj.mac_address,
        mikrotik_id: macObj.mikrotik_id,
        total_vendas: 0,
        total_gasto: 0,
        ultimo_valor: null,
        ultimo_plano: null
      });
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

    // Busca vendas aprovadas
    const vendasAprovadas = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select(`*, plano_id (*)`)
        .eq('mac_id', macObj.id)
        .eq('status', 'aprovado')
        .order('data', { ascending: false })
    );

    // Busca venda pendente mais recente
    const vendaPendenteArr = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('*')
        .eq('mac_id', macObj.id)
        .eq('mikrotik_id', mikrotik_id)
        .in('status', ['aguardando', 'pendente'])
        .order('pagamento_gerado_em', { ascending: false })
        .limit(1)
    );

    let vendaPendente = vendaPendenteArr && vendaPendenteArr[0];

    // Verifica se a venda pendente está expirada (mais de 10 minutos)
    if (vendaPendente && vendaPendente.pagamento_gerado_em) {
      const geradoEm = new Date(vendaPendente.pagamento_gerado_em);
      const agora = new Date();
      const diffMinutos = (agora - geradoEm) / 60000;

      if (diffMinutos > 10) {
        console.log('[STATUS] Pagamento expirado, deletando:', vendaPendente.id);
        await handleSupabaseOperation(() =>
          supabaseAdmin
            .from('vendas')
            .delete()
            .eq('id', vendaPendente.id)
        );
        vendaPendente = null;
      }
    }

    // Estatísticas do MAC
    const totalVendas = vendasAprovadas ? vendasAprovadas.length : 0;
    const totalGasto = vendasAprovadas ? vendasAprovadas.reduce((acc, v) => acc + Number(v.preco || 0), 0) : 0;
    const ultimoValor = vendasAprovadas && vendasAprovadas[0] ? vendasAprovadas[0].preco : null;
    const ultimoPlano = vendasAprovadas && vendasAprovadas[0] ? vendasAprovadas[0].plano_id?.nome || '' : null;

    // Se houver venda pendente, verifica status no Mercado Pago
    if (vendaPendente) {
      console.log('[STATUS] Venda pendente encontrada:', {
        id: vendaPendente.id,
        status: vendaPendente.status,
        payment_id: vendaPendente.payment_id
      });

      try {
        if (vendaPendente.payment_id && vendaPendente.status !== 'aprovado') {
          console.log('[STATUS] Consultando pagamento no Mercado Pago:', vendaPendente.payment_id);
          
          const paymentResult = await handleMercadoPagoFetch(`https://api.mercadopago.com/v1/payments/${vendaPendente.payment_id}`);
          
          if (paymentResult.status === 'approved' && vendaPendente.status !== 'aprovado') {
            console.log('[STATUS] Pagamento aprovado detectado, processando...');
            
            // Buscar informações do mikrotik e plano
            const [mikrotikInfo, planoInfo] = await Promise.all([
              handleSupabaseOperation(() =>
                supabaseAdmin
                  .from('mikrotiks')
                  .select('cliente_id, profitpercentage')
                  .eq('id', mikrotik_id)
                  .single()
              ),
              handleSupabaseOperation(() =>
                supabaseAdmin
                  .from('planos')
                  .select('nome, duracao')
                  .eq('id', vendaPendente.plano_id)
                  .single()
              )
            ]);

            let porcentagemAdmin = mikrotikInfo?.profitpercentage || 10;
            if (porcentagemAdmin > 100) porcentagemAdmin = 100;
            if (porcentagemAdmin < 0) porcentagemAdmin = 0;

            const comissaoAdmin = vendaPendente.preco * (porcentagemAdmin / 100);
            const comissaoDono = vendaPendente.preco - comissaoAdmin;

            // Atualiza saldos
            await supabaseAdmin.rpc('incrementar_saldo_admin', { valor: comissaoAdmin });
            if (mikrotikInfo && mikrotikInfo.cliente_id) {
              await supabaseAdmin.rpc('incrementar_saldo_cliente', { 
                cliente_id: mikrotikInfo.cliente_id, 
                valor: comissaoDono 
              });
            }

            const pagamentoAprovadoEm = new Date().toISOString();

            // Atualiza venda
            await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('vendas')
                .update({
                  status: 'aprovado',
                  pagamento_aprovado_em: pagamentoAprovadoEm,
                  lucro: comissaoAdmin,
                  valor: comissaoDono
                })
                .eq('id', vendaPendente.id)
            );

            // Atualiza MAC
            await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('macs')
                .update({
                  total_gasto: (macObj.total_gasto || 0) + Number(vendaPendente.preco || 0),
                  total_compras: (macObj.total_compras || 0) + 1,
                  ultimo_plano: planoInfo?.nome || vendaPendente.plano_id,
                  ultimo_valor: vendaPendente.preco,
                  ultimo_acesso: new Date().toISOString(),
                  status_pagamento: 'aprovado',
                  pagamento_aprovado_em: pagamentoAprovadoEm,
                  status: 'desconectado' // MAC sempre inicia desconectado
                })
                .eq('id', macObj.id)
            );

            console.log('[VENDA APROVADA] Processada para MAC:', macObj.mac_address);

            // Retorna como aprovado
            return res.json({
              status: 'autenticado',
              mac: macObj.mac_address,
              mikrotik_id: macObj.mikrotik_id,
              total_vendas: totalVendas + 1,
              total_gasto: totalGasto + Number(vendaPendente.preco),
              ultimo_valor: vendaPendente.preco,
              ultimo_plano: planoInfo?.nome,
              plano: planoInfo?.nome,
              duracao: planoInfo?.duracao || 60,
              fim: new Date(new Date().getTime() + (planoInfo?.duracao || 60) * 60000).toISOString()
            });
          }
        }
      } catch (err) {
        console.error('[STATUS] Erro ao consultar Mercado Pago:', err);
      }

      // Se ainda está pendente
      return res.json({
        status: 'pendente',
        mac: macObj.mac_address,
        mikrotik_id: macObj.mikrotik_id,
        total_vendas: totalVendas,
        total_gasto: totalGasto,
        ultimo_valor: ultimoValor,
        ultimo_plano: ultimoPlano,
        pagamento_pendente: {
          status: vendaPendente.status,
          pagamento_gerado_em: vendaPendente.pagamento_gerado_em,
          chave_pix: vendaPendente.chave_pix,
          qrcode: vendaPendente.qrcode,
          valor: vendaPendente.preco,
          payment_id: vendaPendente.payment_id
        }
      });
    }

    // Se houver venda aprovada válida (dentro do tempo)
    const agora = new Date();
    let vendaValida = null;
    if (vendasAprovadas && vendasAprovadas.length > 0) {
      for (const venda of vendasAprovadas) {
        const inicio = new Date(venda.data);
        const duracao = venda.plano_id?.duracao || 60;
        const fim = new Date(inicio.getTime() + duracao * 60000);
        if (agora < fim) {
          vendaValida = venda;
          break;
        }
      }
    }

    if (vendaValida) {
      return res.json({
        status: 'autenticado',
        mac: macObj.mac_address,
        mikrotik_id: macObj.mikrotik_id,
        total_vendas: totalVendas,
        total_gasto: totalGasto,
        ultimo_valor: ultimoValor,
        ultimo_plano: ultimoPlano,
        plano: vendaValida.plano_id?.nome,
        duracao: vendaValida.plano_id?.duracao,
        fim: vendaValida.data ? new Date(new Date(vendaValida.data).getTime() + (vendaValida.plano_id?.duracao || 60) * 60000).toISOString() : null
      });
    }

    // Senão, precisa comprar
    return res.json({
      status: 'precisa_comprar',
      mac: macObj.mac_address,
      mikrotik_id: macObj.mikrotik_id,
      total_vendas: totalVendas,
      total_gasto: totalGasto,
      ultimo_valor: ultimoValor,
      ultimo_plano: ultimoPlano
    });

  } catch (err) {
    next(err);
  }
});

// 3. Gerar PIX (sem verificação de senhas)
app.post('/api/captive-check/pix', async (req, res, next) => {
  try {
    const { mac, plano_id, mikrotik_id, preco, descricao, payer } = req.body;
    console.log('[PIX] Recebido:', { mac, plano_id, mikrotik_id, preco, descricao, payer });

    // Validação de campos
    const requiredFields = { mac, plano_id, mikrotik_id, preco };
    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value)
      .map(([field]) => field);

    if (missingFields.length > 0) {
      throw {
        message: 'Campos obrigatórios ausentes',
        code: 'VALIDATION_ERROR',
        details: `Campos ausentes: ${missingFields.join(', ')}`,
        source: 'API'
      };
    }

    let precoNumerico = Number(preco);
    if (isNaN(precoNumerico) || precoNumerico <= 0) {
      throw {
        message: 'Preço inválido para o pagamento Pix',
        code: 'VALIDATION_ERROR',
        details: `O valor do pagamento deve ser um número maior que zero. Valor recebido: ${preco}`,
        source: 'API'
      };
    }

    if (!isValidMac(mac)) {
      throw {
        message: 'MAC inválido',
        code: 'VALIDATION_ERROR',
        details: 'Formato esperado: XX:XX:XX:XX:XX:XX',
        source: 'API'
      };
    }

    // Busca ou cria MAC
    let macObj = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .select('id')
        .eq('mac_address', mac)
        .single()
    );

    if (!macObj) {
      macObj = await handleSupabaseOperation(() =>
        supabaseAdmin
          .from('macs')
          .insert([{
            mac_address: mac,
            mikrotik_id,
            status: 'desconectado',
            primeiro_acesso: new Date().toISOString()
          }])
          .select('id')
          .single()
      );
    }

    // Verifica se já existe venda pendente
    const vendaPendente = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select('*')
        .eq('mac_id', macObj.id)
        .eq('plano_id', plano_id)
        .eq('mikrotik_id', mikrotik_id)
        .in('status', ['aguardando', 'pendente'])
        .order('pagamento_gerado_em', { ascending: false })
        .limit(1)
    );

    if (vendaPendente && vendaPendente.length > 0) {
      return res.status(400).json({
        error: 'Já existe um pagamento pendente para este MAC/plano/mikrotik.',
        code: 'PENDING_PAYMENT_EXISTS'
      });
    }

    // Sistema sem senhas - sempre permite gerar PIX

    // Verifica plano
    const plano = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('planos')
        .select('id, nome, duracao')
        .eq('id', plano_id)
        .single()
    );

    if (!plano) {
      throw {
        message: 'Plano não encontrado',
        code: 'NOT_FOUND',
        details: `Plano com ID ${plano_id} não existe`,
        source: 'API'
      };
    }

    // Verifica mikrotik
    const mikrotik = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('mikrotiks')
        .select('*')
        .eq('id', mikrotik_id)
        .single()
    );

    if (!mikrotik) {
      throw {
        message: 'Mikrotik não encontrado',
        code: 'NOT_FOUND',
        details: `Mikrotik com ID ${mikrotik_id} não existe`,
        source: 'API'
      };
    }

    // Monta o corpo da requisição
    const paymentData = {
      transaction_amount: precoNumerico,
      description: descricao || plano.nome,
      payment_method_id: 'pix',
      notification_url: 'https://api.lucro.top/api/webhook/mercadopago',
      payer: payer || {
        email: 'comprador@email.com',
        first_name: 'João',
        last_name: 'Silva',
        identification: { type: 'CPF', number: '19119119100' },
        address: {
          zip_code: '06233200',
          street_name: 'Av. das Nações Unidas',
          street_number: '3003',
          neighborhood: 'Bonfim',
          city: 'Osasco',
          federal_unit: 'SP'
        }
      }
    };

    console.log('[PIX] Gerando pagamento:', paymentData);

    const idempotencyKey = `pix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const mpData = await handleMercadoPagoFetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(paymentData)
    });

    console.log('[PIX] Gerado com sucesso, payment_id:', mpData.id);

    // Salva venda
    await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .insert([{
          mac_id: macObj.id,
          plano_id,
          mikrotik_id,
          preco: precoNumerico,
          descricao: descricao || plano.nome,
          status: 'aguardando',
          payment_id: mpData.id,
          chave_pix: mpData.point_of_interaction?.transaction_data?.qr_code,
          qrcode: mpData.point_of_interaction?.transaction_data?.qr_code_base64,
          ticket_url: mpData.id,
          data: new Date().toISOString(),
          pagamento_gerado_em: new Date().toISOString(),
          pagamento_aprovado_em: null
        }])
    );

    // Retorna resposta
    return res.json({
      ...mpData,
      chave_pix: mpData.point_of_interaction?.transaction_data?.qr_code,
      qrcode: mpData.point_of_interaction?.transaction_data?.qr_code_base64,
      ticket_url: mpData.id
    });

  } catch (err) {
    next(err);
  }
});

// 4. Webhook do Mercado Pago (sem entrega de senhas)
app.post('/api/webhook/mercadopago', async (req, res, next) => {
  try {
    console.log('[WEBHOOK MP] Notificação recebida:', {
      headers: req.headers,
      body: req.body,
      query: req.query
    });

    // Responde imediatamente ao Mercado Pago
    res.status(200).send('OK');

    const { id, topic, type, action, data, resource } = req.body;
    const queryId = req.query.id || req.query['data.id'];
    const queryTopic = req.query.topic;

    const paymentTopic = topic || type || queryTopic;
    const paymentId = data?.id || resource || queryId || id;

    if ((paymentTopic === 'payment' || paymentTopic === 'merchant_order') && paymentId) {
      console.log(`[WEBHOOK MP] Processando pagamento ${paymentId}...`);

      setTimeout(async () => {
        try {
          const mpData = await handleMercadoPagoFetch(`https://api.mercadopago.com/v1/payments/${paymentId}`);

          if (mpData.status === 'approved') {
            const venda = await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('vendas')
                .select('*, mac_id(*), plano_id(*), mikrotik_id(*)')
                .eq('payment_id', paymentId)
                .single()
            );

            if (!venda) {
              console.error(`[WEBHOOK MP] Venda não encontrada para payment_id ${paymentId}`);
              return;
            }

            if (venda.status === 'aprovado') {
              console.log(`[WEBHOOK MP] Pagamento ${paymentId} já foi processado`);
              return;
            }

            console.log(`[WEBHOOK MP] Processando aprovação do pagamento ${paymentId}...`);

            // Sistema sem senhas - processa direto

            const mikrotikInfo = await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('mikrotiks')
                .select('cliente_id, profitpercentage')
                .eq('id', venda.mikrotik_id.id)
                .single()
            );

            let porcentagemAdmin = mikrotikInfo?.profitpercentage || 10;
            if (porcentagemAdmin > 100) porcentagemAdmin = 100;
            if (porcentagemAdmin < 0) porcentagemAdmin = 0;

            const comissaoAdmin = venda.preco * (porcentagemAdmin / 100);
            const comissaoDono = venda.preco - comissaoAdmin;

            // Atualiza saldos
            await supabaseAdmin.rpc('incrementar_saldo_admin', { valor: comissaoAdmin });

            if (mikrotikInfo?.cliente_id) {
              await supabaseAdmin.rpc('incrementar_saldo_cliente', { 
                cliente_id: mikrotikInfo.cliente_id, 
                valor: comissaoDono 
              });
            }

            // Atualiza venda
            await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('vendas')
                .update({
                  status: 'aprovado',
                  pagamento_aprovado_em: new Date().toISOString(),
                  lucro: comissaoAdmin,
                  valor: comissaoDono
                })
                .eq('id', venda.id)
            );

            // Atualiza MAC
            await handleSupabaseOperation(() =>
              supabaseAdmin
                .from('macs')
                .update({
                  total_gasto: (venda.mac_id.total_gasto || 0) + Number(venda.preco),
                  total_compras: (venda.mac_id.total_compras || 0) + 1,
                  ultimo_plano: venda.plano_id.nome,
                  ultimo_valor: venda.preco,
                  ultimo_acesso: new Date().toISOString(),
                  status_pagamento: 'aprovado',
                  pagamento_aprovado_em: new Date().toISOString(),
                  status: 'desconectado' // MAC sempre fica desconectado até script do Mikrotik conectar
                })
                .eq('id', venda.mac_id.id)
            );

            console.log(`[WEBHOOK MP] Pagamento ${paymentId} processado com sucesso para MAC ${venda.mac_id.mac_address}!`);
          }

        } catch (error) {
          console.error('[WEBHOOK MP] Erro ao processar pagamento:', error);
        }
      }, 2000);
    }

  } catch (error) {
    console.error('[WEBHOOK MP] Erro no webhook:', error);
    if (!res.headersSent) {
      res.status(200).send('OK');
    }
  }
});

// 5. Recent Sales (MACs desconectados de vendas aprovadas há 1 minuto)
app.get('/api/recent-sales/:mikrotik_id', async (req, res, next) => {
  try {
    const { mikrotik_id } = req.params;

    if (!mikrotik_id) {
      throw {
        message: 'mikrotik_id obrigatório',
        code: 'VALIDATION_ERROR',
        details: 'O ID do Mikrotik é obrigatório',
        source: 'API'
      };
    }

    console.log('[RECENT-SALES] Buscando vendas do último minuto para mikrotik:', mikrotik_id);

    // Data do último minuto
    const agora = new Date();
    const umMinutoAtras = new Date(agora.getTime() - 1 * 60 * 1000);

    // Buscar vendas aprovadas do último minuto para MACs que estão DESCONECTADOS
    const vendas = await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('vendas')
        .select(`
          *,
          mac_id (mac_address, status),
          plano_id (nome, duracao)
        `)
        .eq('mikrotik_id', mikrotik_id)
        .eq('status', 'aprovado')
        .gte('pagamento_aprovado_em', umMinutoAtras.toISOString())
        .order('pagamento_aprovado_em', { ascending: false })
    );

    if (!vendas || vendas.length === 0) {
      console.log('[RECENT-SALES] Nenhuma venda encontrada no último minuto');
      return res.send('');
    }

    // Filtrar apenas MACs desconectados
    const vendasDesconectadas = vendas.filter(venda => 
      venda.mac_id && venda.mac_id.status === 'desconectado'
    );

    if (vendasDesconectadas.length === 0) {
      console.log('[RECENT-SALES] Nenhum MAC desconectado encontrado');
      return res.send('');
    }

    // Montar resposta no formato JSON para Mikrotik
    const macs = vendasDesconectadas.map(venda => ({
      mac: venda.mac_id.mac_address,
      minutos: venda.plano_id?.duracao || 60
    }));

    console.log('[RECENT-SALES] Enviando MACs:', macs);
    return res.send(JSON.stringify(macs));

  } catch (err) {
    console.error('[RECENT-SALES] Erro:', err);
    return res.send('');
  }
});

// 6. Mikrotik Auth Notification
app.post('/api/mikrotik/auth-notification', async (req, res, next) => {
  try {
    const { token, mac_address, mikrotik_id, action } = req.body;

    console.log('[AUTH-NOTIFICATION] Recebido:', { token, mac_address, mikrotik_id, action });

    if (!token || !mac_address || !mikrotik_id || !action) {
      return res.status(400).json({
        error: 'Parâmetros obrigatórios: token, mac_address, mikrotik_id, action'
      });
    }

    // Verifica token de autorização
    const expectedToken = "MkT_Auth_2024_Secure_Token_x9K2mP7qR5nL8vB3";
    if (token !== expectedToken) {
      return res.status(401).json({
        error: 'Token de autorização inválido'
      });
    }

    // Atualiza status do MAC
    const newStatus = action === 'connect' ? 'conectado' : 'desconectado';
    
    await handleSupabaseOperation(() =>
      supabaseAdmin
        .from('macs')
        .update({
          status: newStatus,
          ultimo_acesso: new Date().toISOString()
        })
        .eq('mac_address', mac_address)
        .eq('mikrotik_id', mikrotik_id)
    );

    console.log(`[AUTH-NOTIFICATION] MAC ${mac_address} atualizado para ${newStatus}`);

    return res.json({
      success: true,
      message: `MAC ${mac_address} ${newStatus}`,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    next(err);
  }
});

// Middleware final
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint não encontrado',
    code: 'NOT_FOUND'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API sem senhas rodando na porta ${PORT}`);
  console.log('📡 Sistema baseado apenas em MAC addresses');
  console.log('💰 PIX integrado com Mercado Pago');
  console.log('API sem senhas iniciando...');
});

module.exports = app; 