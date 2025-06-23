-- ============================================================================
-- MIGRAÇÃO PARA MELHORIAS DO WEBHOOK MERCADO PAGO
-- Execute este SQL no seu banco Supabase para adicionar suporte completo 
-- a todos os status de pagamento do Mercado Pago
-- ============================================================================

-- 1. Adicionar campos para rastrear diferentes status de pagamento
ALTER TABLE vendas 
ADD COLUMN IF NOT EXISTS pagamento_rejeitado_em TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS pagamento_cancelado_em TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS pagamento_expirado_em TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS pagamento_reembolsado_em TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS chargeback_em TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS status_detail TEXT NULL,
ADD COLUMN IF NOT EXISTS mercado_pago_status TEXT NULL,
ADD COLUMN IF NOT EXISTS ultima_atualizacao_status TIMESTAMPTZ DEFAULT NOW();

-- 2. Comentários para documentar os novos campos
COMMENT ON COLUMN vendas.pagamento_rejeitado_em IS 'Data/hora quando o pagamento foi rejeitado pelo Mercado Pago';
COMMENT ON COLUMN vendas.pagamento_cancelado_em IS 'Data/hora quando o pagamento foi cancelado';
COMMENT ON COLUMN vendas.pagamento_expirado_em IS 'Data/hora quando o pagamento expirou';
COMMENT ON COLUMN vendas.pagamento_reembolsado_em IS 'Data/hora quando o pagamento foi reembolsado';
COMMENT ON COLUMN vendas.chargeback_em IS 'Data/hora quando houve chargeback';
COMMENT ON COLUMN vendas.status_detail IS 'Detalhes do status vindo do Mercado Pago (ex: cc_rejected_insufficient_amount)';
COMMENT ON COLUMN vendas.mercado_pago_status IS 'Status original vindo do Mercado Pago (approved, rejected, etc)';
COMMENT ON COLUMN vendas.ultima_atualizacao_status IS 'Última vez que o status foi atualizado';

-- 3. Criar índices para otimizar consultas
CREATE INDEX IF NOT EXISTS idx_vendas_mercado_pago_status ON vendas(mercado_pago_status);
CREATE INDEX IF NOT EXISTS idx_vendas_payment_id ON vendas(payment_id);
CREATE INDEX IF NOT EXISTS idx_vendas_status ON vendas(status);
CREATE INDEX IF NOT EXISTS idx_vendas_ultima_atualizacao ON vendas(ultima_atualizacao_status);

-- 4. Criar tabela para log de mudanças de status (auditoria)
CREATE TABLE IF NOT EXISTS vendas_status_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venda_id UUID NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
    status_anterior TEXT,
    status_novo TEXT NOT NULL,
    mercado_pago_status TEXT,
    status_detail TEXT,
    data_mudanca TIMESTAMPTZ DEFAULT NOW(),
    webhook_data JSONB,
    observacoes TEXT
);

COMMENT ON TABLE vendas_status_log IS 'Log de todas as mudanças de status das vendas para auditoria';
CREATE INDEX IF NOT EXISTS idx_vendas_status_log_venda_id ON vendas_status_log(venda_id);
CREATE INDEX IF NOT EXISTS idx_vendas_status_log_data ON vendas_status_log(data_mudanca);

-- 5. Função para reverter saldos em caso de reembolso
CREATE OR REPLACE FUNCTION reverter_saldo_venda(
    p_venda_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_venda RECORD;
    v_mikrotik RECORD;
BEGIN
    -- Buscar dados da venda
    SELECT * INTO v_venda 
    FROM vendas 
    WHERE id = p_venda_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Buscar dados do mikrotik
    SELECT * INTO v_mikrotik 
    FROM mikrotiks 
    WHERE id = v_venda.mikrotik_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Reverter saldo do admin (subtrair lucro)
    IF v_venda.lucro IS NOT NULL AND v_venda.lucro > 0 THEN
        UPDATE clientes 
        SET saldo = saldo - v_venda.lucro 
        WHERE role = 'admin';
    END IF;
    
    -- Reverter saldo do cliente dono do mikrotik (subtrair valor)
    IF v_venda.valor IS NOT NULL AND v_venda.valor > 0 AND v_mikrotik.cliente_id IS NOT NULL THEN
        UPDATE clientes 
        SET saldo = saldo - v_venda.valor 
        WHERE id = v_mikrotik.cliente_id;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 6. Função para registrar mudança de status no log
CREATE OR REPLACE FUNCTION registrar_mudanca_status(
    p_venda_id UUID,
    p_status_anterior TEXT,
    p_status_novo TEXT,
    p_mercado_pago_status TEXT,
    p_status_detail TEXT DEFAULT NULL,
    p_webhook_data JSONB DEFAULT NULL,
    p_observacoes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO vendas_status_log (
        venda_id,
        status_anterior,
        status_novo,
        mercado_pago_status,
        status_detail,
        webhook_data,
        observacoes
    ) VALUES (
        p_venda_id,
        p_status_anterior,
        p_status_novo,
        p_mercado_pago_status,
        p_status_detail,
        p_webhook_data,
        p_observacoes
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger para atualizar automaticamente ultima_atualizacao_status
CREATE OR REPLACE FUNCTION update_ultima_atualizacao_status()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status OR 
       OLD.mercado_pago_status IS DISTINCT FROM NEW.mercado_pago_status THEN
        NEW.ultima_atualizacao_status = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_ultima_atualizacao_status ON vendas;
CREATE TRIGGER trg_update_ultima_atualizacao_status
    BEFORE UPDATE ON vendas
    FOR EACH ROW
    EXECUTE FUNCTION update_ultima_atualizacao_status();

-- 8. View para facilitar consultas de vendas com status completo
CREATE OR REPLACE VIEW vendas_status_completo AS
SELECT 
    v.*,
    m.mac_address,
    p.nome as plano_nome,
    p.preco as plano_preco,
    mt.nome as mikrotik_nome,
    c.nome as cliente_nome,
    s.usuario as senha_usuario,
    -- Status formatado para melhor visualização
    CASE 
        WHEN v.status = 'aprovado' THEN '✅ Aprovado'
        WHEN v.status = 'rejeitado' THEN '❌ Rejeitado'
        WHEN v.status = 'cancelado' THEN '🚫 Cancelado'
        WHEN v.status = 'expirado' THEN '⏰ Expirado'
        WHEN v.status = 'reembolsado' THEN '↩️ Reembolsado'
        WHEN v.status = 'chargeback' THEN '⚠️ Chargeback'
        WHEN v.status = 'pendente' THEN '⏳ Pendente'
        WHEN v.status = 'processando' THEN '🔄 Processando'
        WHEN v.status = 'autorizado' THEN '🔒 Autorizado'
        ELSE '❓ ' || COALESCE(v.status, 'Desconhecido')
    END as status_formatado,
    -- Última data de mudança relevante
    COALESCE(
        v.pagamento_aprovado_em,
        v.pagamento_rejeitado_em,
        v.pagamento_cancelado_em,
        v.pagamento_expirado_em,
        v.pagamento_reembolsado_em,
        v.chargeback_em,
        v.ultima_atualizacao_status
    ) as ultima_mudanca
FROM vendas v
LEFT JOIN macs m ON v.mac_id = m.id
LEFT JOIN planos p ON v.plano_id = p.id
LEFT JOIN mikrotiks mt ON v.mikrotik_id = mt.id
LEFT JOIN clientes c ON mt.cliente_id = c.id
LEFT JOIN senhas s ON v.senha_id = s.id;

COMMENT ON VIEW vendas_status_completo IS 'View com informações completas das vendas e seus status formatados';

-- 9. Função para relatório de status de pagamentos
CREATE OR REPLACE FUNCTION relatorio_status_pagamentos(
    p_data_inicio DATE DEFAULT NULL,
    p_data_fim DATE DEFAULT NULL,
    p_mikrotik_id UUID DEFAULT NULL
) RETURNS TABLE (
    status TEXT,
    quantidade BIGINT,
    valor_total NUMERIC,
    percentual NUMERIC
) AS $$
DECLARE
    v_total_vendas BIGINT;
BEGIN
    -- Calcular total de vendas para percentual
    SELECT COUNT(*) INTO v_total_vendas
    FROM vendas v
    WHERE (p_data_inicio IS NULL OR v.data::DATE >= p_data_inicio)
      AND (p_data_fim IS NULL OR v.data::DATE <= p_data_fim)
      AND (p_mikrotik_id IS NULL OR v.mikrotik_id = p_mikrotik_id);
    
    RETURN QUERY
    SELECT 
        COALESCE(v.status, 'sem_status') as status,
        COUNT(*) as quantidade,
        SUM(COALESCE(v.preco, 0)) as valor_total,
        ROUND((COUNT(*)::NUMERIC / NULLIF(v_total_vendas, 0)) * 100, 2) as percentual
    FROM vendas v
    WHERE (p_data_inicio IS NULL OR v.data::DATE >= p_data_inicio)
      AND (p_data_fim IS NULL OR v.data::DATE <= p_data_fim)
      AND (p_mikrotik_id IS NULL OR v.mikrotik_id = p_mikrotik_id)
    GROUP BY v.status
    ORDER BY quantidade DESC;
END;
$$ LANGUAGE plpgsql;

-- 10. Atualizar vendas existentes com campos padrão
UPDATE vendas 
SET 
    ultima_atualizacao_status = COALESCE(pagamento_aprovado_em, data),
    mercado_pago_status = CASE 
        WHEN status = 'aprovado' THEN 'approved'
        WHEN status = 'rejeitado' THEN 'rejected'
        WHEN status = 'cancelado' THEN 'cancelled'
        WHEN status = 'expirado' THEN 'expired'
        WHEN status = 'pendente' THEN 'pending'
        ELSE status
    END
WHERE ultima_atualizacao_status IS NULL;

-- ============================================================================
-- EXEMPLOS DE USO DAS NOVAS FUNCIONALIDADES
-- ============================================================================

-- Exemplo 1: Consultar relatório de status dos últimos 30 dias
-- SELECT * FROM relatorio_status_pagamentos(CURRENT_DATE - 30, CURRENT_DATE);

-- Exemplo 2: Ver vendas com status completo
-- SELECT * FROM vendas_status_completo WHERE status IN ('aprovado', 'rejeitado') LIMIT 10;

-- Exemplo 3: Consultar log de mudanças de uma venda específica
-- SELECT * FROM vendas_status_log WHERE venda_id = 'UUID_DA_VENDA' ORDER BY data_mudanca DESC;

-- Exemplo 4: Reverter saldos de uma venda (em caso de reembolso manual)
-- SELECT reverter_saldo_venda('UUID_DA_VENDA');

-- ============================================================================
-- VERIFICAÇÕES DE SEGURANÇA E PERFORMANCE
-- ============================================================================

-- Verificar se as funções foram criadas corretamente
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reverter_saldo_venda') THEN
        RAISE EXCEPTION 'Função reverter_saldo_venda não foi criada';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'registrar_mudanca_status') THEN
        RAISE EXCEPTION 'Função registrar_mudanca_status não foi criada';
    END IF;
    
    RAISE NOTICE 'Todas as funções foram criadas com sucesso!';
END
$$;

-- Verificar se os índices foram criados
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_vendas_mercado_pago_status') THEN
        RAISE EXCEPTION 'Índice idx_vendas_mercado_pago_status não foi criado';
    END IF;
    
    RAISE NOTICE 'Todos os índices foram criados com sucesso!';
END
$$;

-- ============================================================================
-- MIGRAÇÃO COMPLETA! 
-- O webhook agora suporta todos os status do Mercado Pago:
-- ✅ approved (aprovado) - Credita saldo e entrega senha
-- ❌ rejected (rejeitado) - Marca como rejeitado
-- 🚫 cancelled (cancelado) - Marca como cancelado  
-- ⏰ expired (expirado) - Marca como expirado
-- ↩️ refunded (reembolsado) - Reverte saldos e libera senha
-- ⚠️ charged_back (chargeback) - Reverte saldos
-- ⏳ pending (pendente) - Atualiza status
-- 🔄 in_process (processando) - Atualiza status
-- 🔒 authorized (autorizado) - Aguardando captura
-- ============================================================================ 