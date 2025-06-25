#!/usr/bin/env node

/**
 * PIX MikroTik API - Entrada principal
 * Versão modular e organizada
 */

const { startServer } = require('./app');

// Função para verificar MACs expirados (placeholder)
async function verificarMacsExpirados() {
  // TODO: Implementar verificação de MACs expirados
  console.log('[STARTUP] Verificação de MACs expirados executada');
}

// Inicializar servidor
async function main() {
  try {
    // Iniciar servidor
    startServer();
    
    // Executar verificações iniciais em background
    setTimeout(verificarMacsExpirados, 1000);
    
  } catch (error) {
    console.error('Erro ao inicializar servidor:', error);
    process.exit(1);
  }
}

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Inicializar aplicação
if (require.main === module) {
  main();
}

module.exports = { main };