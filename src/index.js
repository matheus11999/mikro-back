#!/usr/bin/env node

/**
 * PIX MikroTik API - Entrada principal
 * Versão modular e organizada
 */

const { startServer } = require('./app');
const { executarLimpezaCompleta, agendarLimpezaAutomatica } = require('./services/cleanup');

// Inicializar servidor
async function main() {
  try {
    // Iniciar servidor
    startServer();
    
    // Executar limpeza inicial e agendar automática
    setTimeout(async () => {
      try {
        await executarLimpezaCompleta();
        agendarLimpezaAutomatica();
      } catch (error) {
        console.error('Erro na limpeza inicial:', error.message);
      }
    }, 2000);
    
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