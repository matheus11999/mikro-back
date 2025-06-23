-- ====================================================
-- MIGRAÇÃO: SISTEMA DE HEARTBEAT PARA MIKROTIKS
-- ====================================================
-- Adiciona campos para monitoramento de status online/offline
-- Execute no SQL Editor do Supabase

-- Adicionar campos de heartbeat na tabela mikrotiks
ALTER TABLE mikrotiks ADD COLUMN IF NOT EXISTS ultimo_heartbeat TIMESTAMPTZ;
ALTER TABLE mikrotiks ADD COLUMN IF NOT EXISTS heartbeat_version TEXT;
ALTER TABLE mikrotiks ADD COLUMN IF NOT EXISTS heartbeat_uptime TEXT;

-- Comentários para documentar os novos campos
COMMENT ON COLUMN mikrotiks.ultimo_heartbeat IS 'Timestamp do último heartbeat recebido do MikroTik';
COMMENT ON COLUMN mikrotiks.heartbeat_version IS 'Versão do RouterOS obtida via /system resource print';
COMMENT ON COLUMN mikrotiks.heartbeat_uptime IS 'Uptime do MikroTik obtido via /system resource print';

-- Índices para performance nas consultas de status
CREATE INDEX IF NOT EXISTS idx_mikrotiks_ultimo_heartbeat ON mikrotiks(ultimo_heartbeat);
CREATE INDEX IF NOT EXISTS idx_mikrotiks_status_heartbeat ON mikrotiks(status, ultimo_heartbeat);

-- Função para verificar status online/offline automaticamente
CREATE OR REPLACE FUNCTION verificar_status_mikrotik(mikrotik_id UUID)
RETURNS TABLE(
    id UUID,
    nome TEXT,
    status TEXT,
    ultimo_heartbeat TIMESTAMPTZ,
    is_online BOOLEAN,
    minutos_offline INTEGER
) 
LANGUAGE plpgsql
AS $$
DECLARE
    limite_offline INTERVAL := '15 minutes';
    agora TIMESTAMPTZ := NOW();
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.nome,
        m.status,
        m.ultimo_heartbeat,
        CASE 
            WHEN m.ultimo_heartbeat IS NULL THEN FALSE
            WHEN (agora - m.ultimo_heartbeat) > limite_offline THEN FALSE
            ELSE TRUE
        END as is_online,
        CASE 
            WHEN m.ultimo_heartbeat IS NULL THEN NULL
            ELSE EXTRACT(MINUTES FROM (agora - m.ultimo_heartbeat))::INTEGER
        END as minutos_offline
    FROM mikrotiks m
    WHERE m.id = mikrotik_id;
END;
$$;

-- Função para obter estatísticas de status geral
CREATE OR REPLACE FUNCTION estatisticas_status_mikrotiks()
RETURNS TABLE(
    total_mikrotiks INTEGER,
    online INTEGER,
    offline INTEGER,
    nunca_conectou INTEGER,
    porcentagem_online NUMERIC
) 
LANGUAGE plpgsql
AS $$
DECLARE
    limite_offline INTERVAL := '15 minutes';
    agora TIMESTAMPTZ := NOW();
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_mikrotiks,
        COUNT(CASE WHEN ultimo_heartbeat IS NOT NULL AND (agora - ultimo_heartbeat) <= limite_offline THEN 1 END)::INTEGER as online,
        COUNT(CASE WHEN ultimo_heartbeat IS NOT NULL AND (agora - ultimo_heartbeat) > limite_offline THEN 1 END)::INTEGER as offline,
        COUNT(CASE WHEN ultimo_heartbeat IS NULL THEN 1 END)::INTEGER as nunca_conectou,
        CASE 
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND((COUNT(CASE WHEN ultimo_heartbeat IS NOT NULL AND (agora - ultimo_heartbeat) <= limite_offline THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
        END as porcentagem_online
    FROM mikrotiks;
END;
$$;

-- View para facilitar consultas de status
CREATE OR REPLACE VIEW vw_mikrotiks_status AS
SELECT 
    m.id,
    m.nome,
    m.cliente_id,
    m.status,
    m.ultimo_heartbeat,
    m.heartbeat_version,
    m.heartbeat_uptime,
    c.nome as cliente_nome,
    c.email as cliente_email,
    CASE 
        WHEN m.ultimo_heartbeat IS NULL THEN FALSE
        WHEN (NOW() - m.ultimo_heartbeat) > INTERVAL '15 minutes' THEN FALSE
        ELSE TRUE
    END as is_online,
    CASE 
        WHEN m.ultimo_heartbeat IS NULL THEN NULL
        ELSE EXTRACT(MINUTES FROM (NOW() - m.ultimo_heartbeat))::INTEGER
    END as minutos_offline,
    CASE 
        WHEN m.ultimo_heartbeat IS NULL THEN 'nunca_conectou'
        WHEN (NOW() - m.ultimo_heartbeat) > INTERVAL '15 minutes' THEN 'offline'
        ELSE 'online'
    END as status_conexao,
    m.created_at,
    m.updated_at
FROM mikrotiks m
LEFT JOIN clientes c ON m.cliente_id = c.id;

-- Comentário na view
COMMENT ON VIEW vw_mikrotiks_status IS 'View que mostra o status online/offline de todos os MikroTiks baseado no heartbeat';

-- Política RLS para a view (se necessário)
-- ALTER VIEW vw_mikrotiks_status ENABLE ROW LEVEL SECURITY;

-- OPCIONAL: Tabela de log de heartbeats para auditoria
CREATE TABLE IF NOT EXISTS heartbeat_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mikrotik_id UUID REFERENCES mikrotiks(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    version TEXT,
    uptime TEXT,
    response_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance do log
CREATE INDEX IF NOT EXISTS idx_heartbeat_log_mikrotik_id ON heartbeat_log(mikrotik_id);
CREATE INDEX IF NOT EXISTS idx_heartbeat_log_timestamp ON heartbeat_log(timestamp);

-- Comentário na tabela de log
COMMENT ON TABLE heartbeat_log IS 'Log de todos os heartbeats recebidos dos MikroTiks para auditoria';

-- Trigger para limpar logs antigos (opcional - manter apenas últimos 30 dias)
CREATE OR REPLACE FUNCTION limpar_heartbeat_log_antigo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM heartbeat_log 
    WHERE timestamp < NOW() - INTERVAL '30 days';
    RETURN NULL;
END;
$$;

-- Criar trigger para limpeza automática (executar a cada inserção)
DROP TRIGGER IF EXISTS trigger_limpar_heartbeat_log ON heartbeat_log;
CREATE TRIGGER trigger_limpar_heartbeat_log
    AFTER INSERT ON heartbeat_log
    FOR EACH STATEMENT
    EXECUTE FUNCTION limpar_heartbeat_log_antigo();

-- ====================================================
-- TESTES BÁSICOS (OPCIONAL)
-- ====================================================

-- Verificar se as colunas foram criadas
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'mikrotiks' 
AND column_name IN ('ultimo_heartbeat', 'heartbeat_ip', 'heartbeat_version', 'heartbeat_uptime');

-- Testar função de estatísticas
-- SELECT * FROM estatisticas_status_mikrotiks();

-- Testar view de status
-- SELECT * FROM vw_mikrotiks_status LIMIT 5;

-- ====================================================
-- INSTRUÇÕES DE USO
-- ====================================================

/*
ENDPOINTS DA API:

1. Enviar Heartbeat:
   POST /api/mikrotik/heartbeat
   Body: {
     "mikrotik_id": "uuid-do-mikrotik",
     "token": "token-seguro",
     "version": "7.12 (stable)",
     "uptime": "1d12h33m20s"
   }

2. Verificar Status:
   GET /api/mikrotik/status

SCRIPT MIKROTIK:
- Executa /system resource print para obter version e uptime
- Envia heartbeat a cada 5 minutos via scheduler
- Configurar mikrotik_id e token no script

FRONTEND:
- Usar a view vw_mikrotiks_status para mostrar status online/offline
- Atualizar componentes para exibir indicador visual
- Considerar offline se > 15 minutos sem heartbeat
- Exibir version e uptime dos MikroTiks
*/ 