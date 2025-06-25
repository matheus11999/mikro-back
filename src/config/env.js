require('dotenv').config();

// Configuração de timezone
const TIMEZONE = process.env.TIMEZONE || 'America/Sao_Paulo';

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

module.exports = {
  port: process.env.PORT || 3000,
  apiDomain: process.env.API_DOMAIN || 'https://api.lucro.top',
  timezone: TIMEZONE,
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  },
  mercadoPago: {
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN
  }
};