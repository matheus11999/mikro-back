const { calcularComissao } = require('./src/utils/calculations');

console.log('🧮 TESTANDO NOVA LÓGICA DE CÁLCULOS\n');

const cenarios = [
  { valor: 0.10, porcentagem: 15, esperado: { admin: 0.015, cliente: 0.085 } },
  { valor: 0.01, porcentagem: 10, esperado: { admin: 0.001, cliente: 0.009 } },
  { valor: 5.00, porcentagem: 15, esperado: { admin: 0.750, cliente: 4.250 } },
  { valor: 0.03, porcentagem: 33.33, esperado: { admin: 0.009, cliente: 0.021 } }
];

cenarios.forEach((cenario, index) => {
  console.log(`--- Cenário ${index + 1} ---`);
  console.log(`Valor: R$ ${cenario.valor.toFixed(2)}, Porcentagem: ${cenario.porcentagem}%`);
  
  const resultado = calcularComissao(cenario.valor, cenario.porcentagem);
  
  console.log(`Admin: R$ ${resultado.comissaoAdmin.toFixed(3)} (esperado: R$ ${cenario.esperado.admin.toFixed(3)})`);
  console.log(`Cliente: R$ ${resultado.valorCliente.toFixed(3)} (esperado: R$ ${cenario.esperado.cliente.toFixed(3)})`);
  console.log(`Soma: R$ ${(resultado.comissaoAdmin + resultado.valorCliente).toFixed(3)}`);
  
  const adminOk = Math.abs(resultado.comissaoAdmin - cenario.esperado.admin) < 0.001;
  const clienteOk = Math.abs(resultado.valorCliente - cenario.esperado.cliente) < 0.001;
  
  console.log(`✅ Resultado: ${adminOk && clienteOk ? 'CORRETO' : 'ERRO'}\n`);
});