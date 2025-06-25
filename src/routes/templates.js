const express = require('express');
const path = require('path');
const fs = require('fs');

const { formatDateWithTimezone } = require('../utils/datetime');

const router = express.Router();

// ================================================================
// ROTAS DE TEMPLATES
// ================================================================

/**
 * GET /api/templates/:templateId/:filename
 * Serve arquivos de template do captive portal
 */
router.get('/:templateId/:filename', async (req, res, next) => {
  try {
    const { templateId, filename } = req.params;
    
    console.log(`[${formatDateWithTimezone()}] [TEMPLATES] Servindo arquivo: ${templateId}/${filename}`);

    // Validar templateId (apenas números para segurança)
    if (!/^[0-9]+$/.test(templateId)) {
      throw {
        message: 'Template ID inválido',
        code: 'INVALID_TEMPLATE_ID',
        details: 'O ID do template deve ser numérico',
        source: 'API'
      };
    }

    // Validar filename (apenas caracteres seguros)
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      throw {
        message: 'Nome de arquivo inválido',
        code: 'INVALID_FILENAME',
        details: 'O nome do arquivo contém caracteres não permitidos',
        source: 'API'
      };
    }

    // Construir caminho do arquivo
    const basePath = path.join(__dirname, '../../templates', templateId);
    const filePath = path.join(basePath, filename);

    // Verificar se o arquivo existe
    if (!fs.existsSync(filePath)) {
      console.log(`[${formatDateWithTimezone()}] [TEMPLATES] Arquivo não encontrado: ${filePath}`);
      throw {
        message: 'Arquivo não encontrado',
        code: 'FILE_NOT_FOUND',
        details: `O arquivo ${filename} não existe no template ${templateId}`,
        source: 'API'
      };
    }

    // Verificar se está dentro do diretório permitido (segurança)
    const realPath = fs.realpathSync(filePath);
    const realBasePath = fs.realpathSync(basePath);
    
    if (!realPath.startsWith(realBasePath)) {
      throw {
        message: 'Acesso negado',
        code: 'ACCESS_DENIED',
        details: 'Tentativa de acesso a arquivo fora do diretório permitido',
        source: 'API'
      };
    }

    // Determinar tipo de conteúdo
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'text/plain';
    
    switch (ext) {
      case '.html':
        contentType = 'text/html; charset=utf-8';
        break;
      case '.css':
        contentType = 'text/css; charset=utf-8';
        break;
      case '.js':
        contentType = 'application/javascript; charset=utf-8';
        break;
      case '.json':
        contentType = 'application/json; charset=utf-8';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      case '.svg':
        contentType = 'image/svg+xml';
        break;
    }

    // Definir headers de cache para arquivos estáticos
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600', // Cache por 1 hora
      'X-Template-ID': templateId,
      'X-Served-At': formatDateWithTimezone()
    });

    // Servir arquivo
    res.sendFile(realPath, (err) => {
      if (err) {
        console.error(`[${formatDateWithTimezone()}] [TEMPLATES] Erro ao servir arquivo:`, err.message);
        next({
          message: 'Erro ao servir arquivo',
          code: 'FILE_SERVE_ERROR',
          details: err.message,
          source: 'API'
        });
      } else {
        console.log(`[${formatDateWithTimezone()}] [TEMPLATES] Arquivo servido com sucesso: ${templateId}/${filename}`);
      }
    });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [TEMPLATES] Erro ao servir template:`, error.message);
    next(error);
  }
});

/**
 * GET /api/templates
 * Lista templates disponíveis
 */
router.get('/', async (req, res, next) => {
  try {
    console.log(`[${formatDateWithTimezone()}] [TEMPLATES] Listando templates disponíveis`);

    const templatesPath = path.join(__dirname, '../../templates');
    
    // Verificar se o diretório de templates existe
    if (!fs.existsSync(templatesPath)) {
      throw {
        message: 'Diretório de templates não encontrado',
        code: 'TEMPLATES_DIR_NOT_FOUND',
        details: 'O diretório de templates não foi encontrado no servidor',
        source: 'API'
      };
    }

    // Listar diretórios de templates
    const templateDirs = fs.readdirSync(templatesPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
      .filter(name => /^[0-9]+$/.test(name)) // Apenas diretórios numéricos
      .sort((a, b) => parseInt(a) - parseInt(b));

    // Buscar arquivos de cada template
    const templates = templateDirs.map(templateId => {
      try {
        const templatePath = path.join(templatesPath, templateId);
        const files = fs.readdirSync(templatePath)
          .filter(file => fs.statSync(path.join(templatePath, file)).isFile());

        // Verificar arquivos principais
        const hasIndex = files.includes('login.html') || files.includes('index.html');
        const hasCaptive = files.includes('captive.html');
        
        return {
          id: templateId,
          name: `Template ${templateId}`,
          files: files,
          endpoints: files.map(file => ({
            file: file,
            url: `/api/templates/${templateId}/${file}`
          })),
          features: {
            has_login: hasIndex,
            has_captive: hasCaptive,
            total_files: files.length
          }
        };
      } catch (error) {
        console.error(`Erro ao processar template ${templateId}:`, error.message);
        return {
          id: templateId,
          name: `Template ${templateId}`,
          files: [],
          endpoints: [],
          features: {
            has_login: false,
            has_captive: false,
            total_files: 0
          },
          error: error.message
        };
      }
    });

    console.log(`[${formatDateWithTimezone()}] [TEMPLATES] ${templates.length} templates encontrados`);

    res.json({
      success: true,
      data: {
        templates: templates,
        estatisticas: {
          total_templates: templates.length,
          templates_com_login: templates.filter(t => t.features.has_login).length,
          templates_com_captive: templates.filter(t => t.features.has_captive).length
        },
        timestamp: formatDateWithTimezone()
      }
    });

  } catch (error) {
    console.error(`[${formatDateWithTimezone()}] [TEMPLATES] Erro ao listar templates:`, error.message);
    next(error);
  }
});

module.exports = router;