const { exec } = require('child_process');

const mode = process.env.APP_MODE || 'backend';
const backendPort = process.env.PORT || 3000;
const frontendPort = process.env.FRONTEND_PORT || 5173;

if (mode === 'frontend') {
  console.log(`Iniciando o FRONTEND na porta ${frontendPort}...`);
  console.log(`Acesse: http://localhost:${frontendPort}/`);
  exec('npm run start:frontend', { stdio: 'inherit' });
} else if (mode === 'backend') {
  console.log(`Iniciando o BACKEND (API) na porta ${backendPort}...`);
  console.log(`Acesse: http://localhost:${backendPort}/`);
  exec('npm run start:backend', { stdio: 'inherit' });
} else if (mode === 'both') {
  console.log(`Iniciando FRONTEND e BACKEND...`);
  console.log(`API:      http://localhost:${backendPort}/`);
  console.log(`Frontend: http://localhost:${frontendPort}/`);
  exec('npm run start:both', { stdio: 'inherit' });
} else {
  console.error('APP_MODE inválido! Use "frontend", "backend" ou "both".');
  process.exit(1);
} 