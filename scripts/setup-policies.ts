import { setupPolicies, checkPolicies, removePolicies } from '../src/lib/supabaseAdmin';

async function main() {
  const command = process.argv[2];

  try {
    switch (command) {
      case 'setup':
        await setupPolicies();
        break;
      case 'check':
        await checkPolicies();
        break;
      case 'remove':
        await removePolicies();
        break;
      default:
        console.log('Uso: npm run policies [setup|check|remove]');
        process.exit(1);
    }
  } catch (error) {
    console.error('Erro:', error);
    process.exit(1);
  }
}

main(); 