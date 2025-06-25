/**
 * Utilitários para cálculos financeiros e matemáticos
 */

/**
 * Função para truncar para 3 casas decimais sem arredondar
 * @param {number} valor - Valor a ser truncado
 * @returns {number} Valor truncado
 */
function truncar3Decimais(valor) {
  return Math.trunc(valor * 1000) / 1000;
}

/**
 * Calcula comissão e valor do cliente de forma consistente
 * @param {number} valorTotal - Valor total da venda
 * @param {number} porcentagemAdmin - Porcentagem do admin (0-100)
 * @returns {object} { comissaoAdmin, valorCliente }
 */
function calcularComissao(valorTotal, porcentagemAdmin) {
  // Validar porcentagem
  const porcentagem = Math.max(0, Math.min(100, parseFloat(porcentagemAdmin) || 10));
  
  // Calcular comissão primeiro para maior precisão
  const comissaoAdmin = truncar3Decimais(valorTotal * (porcentagem / 100));
  const valorCliente = truncar3Decimais(valorTotal - comissaoAdmin);
  
  return {
    comissaoAdmin,
    valorCliente,
    porcentagemUsada: porcentagem
  };
}

/**
 * Valida se um valor é um número válido para cálculos financeiros
 * @param {any} valor - Valor a ser validado
 * @returns {boolean}
 */
function isValidFinancialValue(valor) {
  return typeof valor === 'number' && !isNaN(valor) && isFinite(valor) && valor >= 0;
}

module.exports = {
  truncar3Decimais,
  calcularComissao,
  isValidFinancialValue
};