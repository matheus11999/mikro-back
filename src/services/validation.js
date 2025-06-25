const { z } = require('zod');

/**
 * Schemas de validação padronizados para toda a API
 */

// Validações básicas reutilizáveis
const uuid = z.string().uuid('Deve ser um UUID válido');
const macAddress = z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, 'MAC address inválido').optional()
  .or(z.string().min(1, 'MAC address é obrigatório'));
const positiveNumber = z.number().positive('Deve ser um número positivo');
const nonNegativeNumber = z.number().min(0, 'Deve ser um número não negativo');

// Schemas específicos para cada endpoint
const schemas = {
  // Captive Portal
  captive: {
    planos: z.object({
      mikrotik_id: uuid
    }),
    
    status: z.object({
      mac: z.string().min(1, 'MAC address é obrigatório'),
      mikrotik_id: uuid
    }),
    
    pix: z.object({
      mac: z.string().min(1, 'MAC address é obrigatório'),
      plano_id: uuid,
      mikrotik_id: uuid
    }),
    
    verify: z.object({
      payment_id: z.string().min(1, 'payment_id é obrigatório')
    })
  },

  // MikroTik
  mikrotik: {
    recentSales: z.object({
      mikrotik_id: uuid,
      token: z.string().min(1, 'Token é obrigatório'),
      limit: z.number().min(1).max(100).optional().default(10)
    }),
    
    authNotification: z.object({
      mikrotik_id: uuid,
      token: z.string().min(1, 'Token é obrigatório'),
      mac: z.string().min(1, 'MAC address é obrigatório'),
      tempo_restante: nonNegativeNumber
    }),
    
    heartbeat: z.object({
      mikrotik_id: uuid,
      token: z.string().min(1, 'Token é obrigatório'),
      status: z.string().optional().default('online'),
      macs_conectados: nonNegativeNumber.optional().default(0)
    }),
    
    installScripts: z.object({
      mikrotik_id: uuid,
      token: z.string().min(1, 'Token é obrigatório'),
      api_url: z.string().url().optional()
    })
  },

  // Webhook
  webhook: {
    mercadoPago: z.object({
      action: z.string().optional(),
      api_version: z.string().optional(),
      data: z.object({
        id: z.union([z.string(), z.number()])
      }).optional(),
      id: z.union([z.string(), z.number()]).optional(),
      live_mode: z.boolean().optional(),
      type: z.string().optional(),
      user_id: z.string().optional()
    })
  },

  // Admin
  admin: {
    regenerateToken: z.object({
      id: uuid
    })
  }
};

/**
 * Middleware de validação
 * @param {object} schema - Schema Zod para validação
 * @param {string} source - Fonte dos dados ('body', 'params', 'query')
 * @returns {Function} Middleware function
 */
function validateRequest(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const data = req[source];
      const validated = schema.parse(data);
      req[`validated_${source}`] = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          received: err.received
        }));

        next({
          message: 'Dados de entrada inválidos',
          code: 'VALIDATION_ERROR',
          details: details,
          source: 'VALIDATION'
        });
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validação de valores financeiros
 * @param {number} valor - Valor a ser validado
 * @returns {boolean}
 */
function isValidFinancialValue(valor) {
  return typeof valor === 'number' && 
         !isNaN(valor) && 
         isFinite(valor) && 
         valor >= 0 &&
         valor <= 999999; // Limite máximo razoável
}

/**
 * Validação de porcentagem
 * @param {number} porcentagem - Porcentagem a ser validada
 * @returns {boolean}
 */
function isValidPercentage(porcentagem) {
  return typeof porcentagem === 'number' && 
         !isNaN(porcentagem) && 
         isFinite(porcentagem) && 
         porcentagem >= 0 && 
         porcentagem <= 100;
}

module.exports = {
  schemas,
  validateRequest,
  isValidFinancialValue,
  isValidPercentage
};