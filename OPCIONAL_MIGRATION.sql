-- MIGRAÇÃO OPCIONAL - Adicionar campos para melhor tracking de autenticação
-- Execute no SQL Editor do Supabase se quiser dados mais detalhados

-- Adicionar campos opcionais na tabela macs
ALTER TABLE macs ADD COLUMN IF NOT EXISTS ultimo_usuario_mikrotik TEXT;
ALTER TABLE macs ADD COLUMN IF NOT EXISTS ultimo_ip TEXT;

-- Comentários para documentar os novos campos
COMMENT ON COLUMN macs.ultimo_usuario_mikrotik IS 'Último usuário que se autenticou no Mikrotik com este MAC';
COMMENT ON COLUMN macs.ultimo_ip IS 'Último IP atribuído a este MAC durante a autenticação';

-- OPCIONAL: Criar tabela de logs para auditoria (se quiser histórico completo)
CREATE TABLE IF NOT EXISTS logs_autenticacao (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mac_id UUID REFERENCES macs(id),
    mac_address TEXT NOT NULL,
    mikrotik_id UUID REFERENCES mikrotiks(id),
    action TEXT NOT NULL, -- 'connect', 'disconnect', etc.
    usuario_mikrotik TEXT,
    ip_address TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    status_anterior TEXT,
    status_novo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance (opcional)
CREATE INDEX IF NOT EXISTS idx_logs_autenticacao_mac_id ON logs_autenticacao(mac_id);
CREATE INDEX IF NOT EXISTS idx_logs_autenticacao_timestamp ON logs_autenticacao(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_autenticacao_mikrotik_id ON logs_autenticacao(mikrotik_id);

-- Comentário na tabela
COMMENT ON TABLE logs_autenticacao IS 'Log de todas as autenticações/desconexões do Mikrotik para auditoria'; 