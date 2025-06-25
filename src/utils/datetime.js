const { timezone } = require('../config/env');

/**
 * Função utilitária para formatar data com timezone
 * @param {Date} date - Data a ser formatada (default: agora)
 * @returns {string} Data formatada
 */
function formatDateWithTimezone(date = new Date()) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

/**
 * Retorna timestamp ISO atual
 * @returns {string}
 */
function getCurrentISOTimestamp() {
  return new Date().toISOString();
}

module.exports = {
  formatDateWithTimezone,
  getCurrentISOTimestamp
};