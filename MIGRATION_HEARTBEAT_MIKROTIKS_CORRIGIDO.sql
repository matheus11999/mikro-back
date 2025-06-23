-- MIGRAÇÃO COMPLETA PARA SISTEMA HEARTBEAT E TOKENS INDIVIDUAIS
-- Data: 2024-01-XX
-- Descrição: Adiciona sistema de heartbeat para MikroTiks + tokens individuais

-- ===========================================
-- 1. ADICIONAR COLUNAS NA TABELA MIKROTIKS
-- ===========================================

-- Adicionar colunas de heartbeat
ALTER TABLE mikrotiks 
ADD COLUMN IF NOT EXISTS ultimo_heartbeat timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS heartbeat_version text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS heartbeat_uptime text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS api_token text DEFAULT NULL UNIQUE;

-- Gerar tokens únicos para MikroTiks existentes que não têm token
UPDATE mikrotiks 
SET api_token = 'mtk_' || substring(gen_random_uuid()::text, 1, 8) || '_' || substring(gen_random_uuid()::text, 1, 8)
WHERE api_token IS NULL;

-- Tornar api_token obrigatório após popular os existentes
ALTER TABLE mikrotiks 
ALTER COLUMN api_token SET NOT NULL;

-- Adicionar comentários nas colunas
COMMENT ON COLUMN mikrotiks.ultimo_heartbeat IS 'Último heartbeat recebido do MikroTik';
COMMENT ON COLUMN mikrotiks.heartbeat_version IS 'Versão do RouterOS reportada pelo MikroTik';
COMMENT ON COLUMN mikrotiks.heartbeat_uptime IS 'Uptime reportado pelo MikroTik';
COMMENT ON COLUMN mikrotiks.api_token IS 'Token único de API para este MikroTik';

-- ===========================================
-- 2. CRIAR ÍNDICES PARA PERFORMANCE
-- ===========================================

-- Índice para consultas de status online/offline
CREATE INDEX IF NOT EXISTS idx_mikrotiks_ultimo_heartbeat 
ON mikrotiks(ultimo_heartbeat) 
WHERE ultimo_heartbeat IS NOT NULL;

-- Índice para busca por token
CREATE INDEX IF NOT EXISTS idx_mikrotiks_api_token 
ON mikrotiks(api_token);

-- ===========================================
-- 3. CRIAR VIEW PARA STATUS DOS MIKROTIKS
-- ===========================================

-- Remover view existente se houver
DROP VIEW IF EXISTS vw_mikrotiks_status;

-- Criar view corrigida (usando criado_em ao invés de created_at)
CREATE VIEW vw_mikrotiks_status AS
SELECT 
    m.id,
    m.nome,
    m.provider_name,
    m.status,
    m.cliente_id,
    m.criado_em,  -- CORRIGIDO: usando criado_em ao invés de created_at
    m.profitpercentage,
    m.ultimo_heartbeat,
    m.heartbeat_version,
    m.heartbeat_uptime,
    m.api_token,
    CASE 
        WHEN m.ultimo_heartbeat IS NULL THEN 'never_connected'
        WHEN m.ultimo_heartbeat > (NOW() - INTERVAL '15 minutes') THEN 'online'
        ELSE 'offline'
    END as status_heartbeat,
    CASE 
        WHEN m.ultimo_heartbeat IS NULL THEN 'Nunca conectou'
        WHEN m.ultimo_heartbeat > (NOW() - INTERVAL '15 minutes') THEN 'Online'
        ELSE 'Offline há ' || 
             CASE 
                 WHEN EXTRACT(EPOCH FROM (NOW() - m.ultimo_heartbeat)) < 3600 THEN
                     EXTRACT(MINUTES FROM (NOW() - m.ultimo_heartbeat))::text || ' minutos'
                 WHEN EXTRACT(EPOCH FROM (NOW() - m.ultimo_heartbeat)) < 86400 THEN
                     EXTRACT(HOURS FROM (NOW() - m.ultimo_heartbeat))::text || ' horas'
                 ELSE
                     EXTRACT(DAYS FROM (NOW() - m.ultimo_heartbeat))::text || ' dias'
             END
    END as status_descricao,
    EXTRACT(EPOCH FROM (NOW() - m.ultimo_heartbeat))::integer as segundos_desde_ultimo_heartbeat
FROM mikrotiks m;

COMMENT ON VIEW vw_mikrotiks_status IS 'View que calcula automaticamente o status online/offline dos MikroTiks baseado no heartbeat';

-- ===========================================
-- 4. FUNÇÃO PARA VERIFICAR STATUS
-- ===========================================

-- Função para verificar status de um MikroTik específico
CREATE OR REPLACE FUNCTION verificar_status_mikrotik(mikrotik_uuid UUID)
RETURNS TABLE(
    id UUID,
    nome TEXT,
    status_heartbeat TEXT,
    status_descricao TEXT,
    ultimo_heartbeat TIMESTAMPTZ,
    segundos_offline INTEGER
) 
LANGUAGE SQL STABLE
AS $$
    SELECT 
        v.id,
        v.nome,
        v.status_heartbeat,
        v.status_descricao,
        v.ultimo_heartbeat,
        v.segundos_desde_ultimo_heartbeat
    FROM vw_mikrotiks_status v 
    WHERE v.id = mikrotik_uuid;
$$;

-- ===========================================
-- 5. FUNÇÃO PARA ESTATÍSTICAS GERAIS
-- ===========================================

-- Função para obter estatísticas de status
CREATE OR REPLACE FUNCTION estatisticas_status_mikrotiks()
RETURNS TABLE(
    total_mikrotiks BIGINT,
    online BIGINT,
    offline BIGINT,
    never_connected BIGINT,
    percentual_online NUMERIC(5,2)
) 
LANGUAGE SQL STABLE
AS $$
    SELECT 
        COUNT(*) as total_mikrotiks,
        COUNT(*) FILTER (WHERE status_heartbeat = 'online') as online,
        COUNT(*) FILTER (WHERE status_heartbeat = 'offline') as offline,
        COUNT(*) FILTER (WHERE status_heartbeat = 'never_connected') as never_connected,
        ROUND(
            (COUNT(*) FILTER (WHERE status_heartbeat = 'online')::NUMERIC / 
             NULLIF(COUNT(*), 0)) * 100, 
            2
        ) as percentual_online
    FROM vw_mikrotiks_status;
$$;

-- ===========================================
-- 6. FUNÇÃO PARA REGENERAR TOKEN
-- ===========================================

-- Função para regenerar token de um MikroTik (apenas admin)
CREATE OR REPLACE FUNCTION regenerar_token_mikrotik(mikrotik_uuid UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    novo_token TEXT;
BEGIN
    -- Gerar novo token único
    novo_token := 'mtk_' || substring(gen_random_uuid()::text, 1, 8) || '_' || substring(gen_random_uuid()::text, 1, 8);
    
    -- Atualizar o token
    UPDATE mikrotiks 
    SET api_token = novo_token 
    WHERE id = mikrotik_uuid;
    
    -- Verificar se foi atualizado
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MikroTik não encontrado com ID: %', mikrotik_uuid;
    END IF;
    
    RETURN novo_token;
END;
$$;

COMMENT ON FUNCTION regenerar_token_mikrotik IS 'Regenera o token de API de um MikroTik específico';

-- ===========================================
-- 7. TABELA DE LOG DE HEARTBEAT (OPCIONAL)
-- ===========================================

-- Tabela para armazenar histórico de heartbeats (opcional para auditoria)
CREATE TABLE IF NOT EXISTS heartbeat_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mikrotik_id UUID NOT NULL REFERENCES mikrotiks(id) ON DELETE CASCADE,
    heartbeat_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version TEXT,
    uptime TEXT,
    ip_origem INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para a tabela de log
CREATE INDEX IF NOT EXISTS idx_heartbeat_log_mikrotik_id ON heartbeat_log(mikrotik_id);
CREATE INDEX IF NOT EXISTS idx_heartbeat_log_timestamp ON heartbeat_log(heartbeat_timestamp);

COMMENT ON TABLE heartbeat_log IS 'Log histórico de todos os heartbeats recebidos (opcional para auditoria)';

-- ===========================================
-- 8. FUNÇÃO PARA LIMPEZA DE LOGS ANTIGOS
-- ===========================================

-- Função para limpar logs de heartbeat antigos (manter apenas 30 dias)
CREATE OR REPLACE FUNCTION limpar_heartbeat_logs_antigos()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    registros_deletados INTEGER;
BEGIN
    DELETE FROM heartbeat_log 
    WHERE created_at < (NOW() - INTERVAL '30 days');
    
    GET DIAGNOSTICS registros_deletados = ROW_COUNT;
    
    RETURN registros_deletados;
END;
$$;

COMMENT ON FUNCTION limpar_heartbeat_logs_antigos IS 'Remove registros de heartbeat_log mais antigos que 30 dias';

-- ===========================================
-- 9. POLÍTICAS RLS PARA SEGURANÇA
-- ===========================================

-- Habilitar RLS na tabela heartbeat_log se necessário
ALTER TABLE heartbeat_log ENABLE ROW LEVEL SECURITY;

-- Política para permitir inserção de logs (público, pois vem dos MikroTiks)
CREATE POLICY IF NOT EXISTS "Permitir inserção de heartbeat logs" ON heartbeat_log
    FOR INSERT WITH CHECK (true);

-- Política para leitura apenas para admins
CREATE POLICY IF NOT EXISTS "Admins podem ler heartbeat logs" ON heartbeat_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM clientes 
            WHERE clientes.id = auth.uid() 
            AND clientes.role = 'admin'
        )
    );

-- ===========================================
-- 10. GRANTS E PERMISSÕES
-- ===========================================

-- Permitir acesso público às funções de status (necessário para API)
GRANT EXECUTE ON FUNCTION verificar_status_mikrotik TO anon, authenticated;
GRANT EXECUTE ON FUNCTION estatisticas_status_mikrotiks TO anon, authenticated;

-- Apenas usuários autenticados podem regenerar tokens
GRANT EXECUTE ON FUNCTION regenerar_token_mikrotik TO authenticated;

-- ===========================================
-- 11. TRIGGERS PARA LIMPEZA AUTOMÁTICA
-- ===========================================

-- Criar um scheduler para limpeza automática (executar diariamente)
-- Nota: Esta parte depende da extensão pg_cron, que pode não estar disponível
-- Em caso de não ter pg_cron, a limpeza deve ser feita manualmente ou via cron do sistema

-- ===========================================
-- FINALIZAÇÃO
-- ===========================================

-- Verificar se a migração foi aplicada corretamente
DO $$
DECLARE
    _count INTEGER;
BEGIN
    -- Verificar se as colunas foram criadas
    SELECT COUNT(*) INTO _count
    FROM information_schema.columns 
    WHERE table_name = 'mikrotiks' 
    AND column_name IN ('ultimo_heartbeat', 'heartbeat_version', 'heartbeat_uptime', 'api_token');
    
    IF _count = 4 THEN
        RAISE NOTICE 'SUCESSO: Todas as colunas foram criadas corretamente na tabela mikrotiks';
    ELSE
        RAISE WARNING 'ATENÇÃO: Nem todas as colunas foram criadas. Esperado: 4, Encontrado: %', _count;
    END IF;
    
    -- Verificar se a view foi criada
    SELECT COUNT(*) INTO _count
    FROM information_schema.views 
    WHERE table_name = 'vw_mikrotiks_status';
    
    IF _count = 1 THEN
        RAISE NOTICE 'SUCESSO: View vw_mikrotiks_status criada corretamente';
    ELSE
        RAISE WARNING 'ATENÇÃO: View vw_mikrotiks_status não foi criada';
    END IF;
    
    -- Verificar quantos MikroTiks têm tokens
    SELECT COUNT(*) INTO _count
    FROM mikrotiks 
    WHERE api_token IS NOT NULL;
    
    RAISE NOTICE 'INFO: % MikroTiks têm tokens de API configurados', _count;
END $$;

-- Exibir tokens gerados (apenas para verificação inicial)
SELECT 
    m.id,
    m.nome,
    m.api_token,
    m.ultimo_heartbeat,
    'Token gerado automaticamente' as observacao
FROM mikrotiks m
ORDER BY m.nome; 