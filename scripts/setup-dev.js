#!/usr/bin/env node

/**
 * Script de configuração para ambiente de desenvolvimento local
 * PIX MikroTik - Configuração automática
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupLocalDevelopment() {
  console.log('🚀 PIX MikroTik - Configuração de Desenvolvimento Local\n');
  
  try {
    // 1. Verificar se .env.local já existe
    const envLocalPath = path.join(__dirname, '../.env.local');
    if (fs.existsSync(envLocalPath)) {
      const overwrite = await question('❓ Arquivo .env.local já existe. Sobrescrever? (s/N): ');
      if (overwrite.toLowerCase() !== 's') {
        console.log('❌ Configuração cancelada pelo usuário.');
        return;
      }
    }

    console.log('📝 Configurando variáveis de ambiente...\n');

    // 2. Coletar configurações
    const config = {};
    
    // Configurações básicas
    config.PORT = await question('🔌 Porta do servidor backend (3000): ') || '3000';
    config.API_DOMAIN = `http://localhost:${config.PORT}`;
    config.TIMEZONE = await question('🌍 Timezone (America/Sao_Paulo): ') || 'America/Sao_Paulo';
    
    console.log('\n🗄️  Configurações do Supabase:');
    config.SUPABASE_URL = await question('📡 URL do projeto Supabase: ');
    if (!config.SUPABASE_URL) {
      throw new Error('URL do Supabase é obrigatória');
    }
    
    config.SUPABASE_SERVICE_ROLE_KEY = await question('🔑 Service Role Key do Supabase: ');
    if (!config.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Service Role Key do Supabase é obrigatória');
    }
    
    console.log('\n💳 Configurações do Mercado Pago:');
    config.MERCADO_PAGO_ACCESS_TOKEN = await question('🎫 Access Token do Mercado Pago: ');
    if (!config.MERCADO_PAGO_ACCESS_TOKEN) {
      throw new Error('Access Token do Mercado Pago é obrigatório');
    }
    
    // Debug mode
    const debugMode = await question('\\n🐛 Ativar modo debug? (S/n): ');
    config.DEBUG = debugMode.toLowerCase() !== 'n' ? 'true' : 'false';

    // 3. Criar .env.local para backend
    const envContent = `# PIX MikroTik - Configuração Local de Desenvolvimento
# Gerado automaticamente em ${new Date().toISOString()}

# Configuração do Servidor
PORT=${config.PORT}
API_DOMAIN=${config.API_DOMAIN}

# Configuração de Timezone
TIMEZONE=${config.TIMEZONE}

# Supabase
SUPABASE_URL=${config.SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${config.SUPABASE_SERVICE_ROLE_KEY}

# Mercado Pago
MERCADO_PAGO_ACCESS_TOKEN=${config.MERCADO_PAGO_ACCESS_TOKEN}

# MikroTik Webhook URL (para scripts gerados)
WEBHOOK_URL=${config.API_DOMAIN}

# Debug Mode
DEBUG=${config.DEBUG}

# Node Environment
NODE_ENV=development
`;

    fs.writeFileSync(envLocalPath, envContent);
    console.log('✅ Arquivo .env.local criado para o backend');

    // 4. Criar .env.local para frontend
    const frontendEnvPath = path.join(__dirname, '../../frontend/.env.local');
    const frontendEnvContent = `# PIX MikroTik Frontend - Configuração Local de Desenvolvimento
# Gerado automaticamente em ${new Date().toISOString()}

# URL da API Backend
VITE_API_URL=${config.API_DOMAIN}

# URL do WebSocket (se necessário)
VITE_WS_URL=ws://localhost:${config.PORT}

# Configurações de debug
VITE_DEBUG=${config.DEBUG}

# Configurações do Supabase (para autenticação frontend se necessário)
VITE_SUPABASE_URL=${config.SUPABASE_URL}
# Nota: Use a ANON key aqui, não a Service Role Key
# VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
`;

    fs.writeFileSync(frontendEnvPath, frontendEnvContent);
    console.log('✅ Arquivo .env.local criado para o frontend');

    // 5. Verificar dependências
    console.log('\\n📦 Verificando dependências...');
    
    const packageJsonPath = path.join(__dirname, '../package.json');
    if (!fs.existsSync(packageJsonPath)) {
      console.log('❌ package.json não encontrado no backend');
    } else {
      console.log('✅ package.json encontrado no backend');
    }

    const frontendPackageJsonPath = path.join(__dirname, '../../frontend/package.json');
    if (!fs.existsSync(frontendPackageJsonPath)) {
      console.log('❌ package.json não encontrado no frontend');
    } else {
      console.log('✅ package.json encontrado no frontend');
    }

    // 6. Instruções finais
    console.log('\\n🎉 Configuração concluída com sucesso!\\n');
    console.log('📋 Próximos passos:');
    console.log('\\n1. Instalar dependências do backend:');
    console.log('   cd backend && npm install');
    console.log('\\n2. Instalar dependências do frontend:');
    console.log('   cd frontend && npm install');
    console.log('\\n3. Iniciar o servidor backend:');
    console.log('   cd backend && npm start');
    console.log('\\n4. Iniciar o servidor frontend (em outro terminal):');
    console.log('   cd frontend && npm run dev');
    console.log('\\n5. Acessar o sistema:');
    console.log(`   Backend: ${config.API_DOMAIN}/health`);
    console.log('   Frontend: http://localhost:5173');
    console.log('\\n6. Testar endpoints da API:');
    console.log(`   curl ${config.API_DOMAIN}/health`);
    console.log(`   curl ${config.API_DOMAIN}/api/mikrotik/status`);
    
    if (config.DEBUG === 'true') {
      console.log('\\n🐛 Modo debug ativado - logs detalhados serão exibidos');
    }
    
    console.log('\\n📝 Configurações salvas em:');
    console.log(`   Backend: ${envLocalPath}`);
    console.log(`   Frontend: ${frontendEnvPath}`);
    
    console.log('\\n⚠️  Importante:');
    console.log('   - Não commite os arquivos .env.local para o repositório');
    console.log('   - Mantenha suas chaves de API seguras');
    console.log('   - Use URLs de produção apenas em ambiente de produção');

  } catch (error) {
    console.error('\\n❌ Erro durante a configuração:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Executar configuração
if (require.main === module) {
  setupLocalDevelopment().catch(console.error);
}

module.exports = { setupLocalDevelopment };