const NotificationTemplateService = require('../services/notificationTemplateService');

class NotificationTemplateController {
  constructor() {
    this.templateService = new NotificationTemplateService();
  }

  // Get all templates
  async getTemplates(req, res) {
    try {
      const { type, isActive = true } = req.query;
      
      const templates = await this.templateService.listTemplates(
        type ? type.toUpperCase() : null,
        isActive === 'true'
      );

      res.json({
        success: true,
        data: templates,
        message: 'Templates retrieved successfully'
      });
    } catch (error) {
      console.error('Get templates error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve templates',
          details: error.message
        }
      });
    }
  }

  // Get specific template
  async getTemplate(req, res) {
    try {
      const { type, name } = req.params;
      
      const template = await this.templateService.getTemplate(type.toUpperCase(), name);
      
      if (!template) {
        return res.status(404).json({
          success: false,
          error: { message: 'Template not found' }
        });
      }

      res.json({
        success: true,
        data: template,
        message: 'Template retrieved successfully'
      });
    } catch (error) {
      console.error('Get template error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve template',
          details: error.message
        }
      });
    }
  }

  // Create new template
  async createTemplate(req, res) {
    try {
      const { type, name, subject, content, variables = [], description } = req.body;

      if (!type || !name || !content) {
        return res.status(400).json({
          success: false,
          error: { message: 'Type, name, and content are required' }
        });
      }

      const templateData = {
        type: type.toUpperCase(),
        name,
        subject,
        content,
        variables,
        description
      };

      const template = await this.templateService.createTemplate(templateData);

      res.status(201).json({
        success: true,
        data: template,
        message: 'Template created successfully'
      });
    } catch (error) {
      console.error('Create template error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to create template',
          details: error.message
        }
      });
    }
  }

  // Update template
  async updateTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const updates = req.body;

      // Remove fields that shouldn't be updated directly
      delete updates.templateId;
      delete updates.createdAt;
      delete updates.version;

      const template = await this.templateService.updateTemplate(templateId, updates);

      res.json({
        success: true,
        data: template,
        message: 'Template updated successfully'
      });
    } catch (error) {
      console.error('Update template error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to update template',
          details: error.message
        }
      });
    }
  }

  // Delete template (soft delete)
  async deleteTemplate(req, res) {
    try {
      const { templateId } = req.params;

      const template = await this.templateService.deleteTemplate(templateId);

      res.json({
        success: true,
        data: template,
        message: 'Template deleted successfully'
      });
    } catch (error) {
      console.error('Delete template error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to delete template',
          details: error.message
        }
      });
    }
  }

  // Preview template with sample data
  async previewTemplate(req, res) {
    try {
      const { type, name } = req.params;
      const { variables = {} } = req.body;

      const preview = await this.templateService.previewTemplate(
        type.toUpperCase(),
        name,
        variables
      );

      res.json({
        success: true,
        data: preview,
        message: 'Template preview generated successfully'
      });
    } catch (error) {
      console.error('Preview template error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to preview template',
          details: error.message
        }
      });
    }
  }

  // Render template with actual data
  async renderTemplate(req, res) {
    try {
      const { type, name } = req.params;
      const { variables = {} } = req.body;

      if (!variables || Object.keys(variables).length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Variables are required for template rendering' }
        });
      }

      const rendered = await this.templateService.renderTemplate(
        type.toUpperCase(),
        name,
        variables
      );

      res.json({
        success: true,
        data: rendered,
        message: 'Template rendered successfully'
      });
    } catch (error) {
      console.error('Render template error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to render template',
          details: error.message
        }
      });
    }
  }

  // Get template usage statistics
  async getTemplateUsageStats(req, res) {
    try {
      const stats = await this.templateService.getTemplateUsageStats();

      res.json({
        success: true,
        data: stats,
        message: 'Template usage statistics retrieved successfully'
      });
    } catch (error) {
      console.error('Get template stats error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve template statistics',
          details: error.message
        }
      });
    }
  }

  // Create A/B test variant
  async createTemplateVariant(req, res) {
    try {
      const { templateId } = req.params;
      const { subject, content, description } = req.body;

      if (!subject && !content) {
        return res.status(400).json({
          success: false,
          error: { message: 'Either subject or content must be provided for variant' }
        });
      }

      const variant = await this.templateService.createTemplateVariant(templateId, {
        subject,
        content,
        description
      });

      res.status(201).json({
        success: true,
        data: variant,
        message: 'Template variant created successfully'
      });
    } catch (error) {
      console.error('Create template variant error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to create template variant',
          details: error.message
        }
      });
    }
  }

  // Create template translation
  async createTranslation(req, res) {
    try {
      const { templateId } = req.params;
      const { language, subject, content } = req.body;

      if (!language || !content) {
        return res.status(400).json({
          success: false,
          error: { message: 'Language and content are required for translation' }
        });
      }

      const translation = await this.templateService.createTranslation(
        templateId,
        language.toLowerCase(),
        { subject, content }
      );

      res.status(201).json({
        success: true,
        data: translation,
        message: 'Template translation created successfully'
      });
    } catch (error) {
      console.error('Create translation error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to create template translation',
          details: error.message
        }
      });
    }
  }

  // Get template translation
  async getTranslation(req, res) {
    try {
      const { templateId, language } = req.params;

      const translation = await this.templateService.getTemplateTranslation(
        templateId,
        language.toLowerCase()
      );

      if (!translation) {
        return res.status(404).json({
          success: false,
          error: { message: 'Translation not found' }
        });
      }

      res.json({
        success: true,
        data: translation,
        message: 'Template translation retrieved successfully'
      });
    } catch (error) {
      console.error('Get translation error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve template translation',
          details: error.message
        }
      });
    }
  }

  // Bulk operations
  async bulkUpdateTemplates(req, res) {
    try {
      const { templates } = req.body;

      if (!Array.isArray(templates) || templates.length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Templates array is required' }
        });
      }

      const results = [];
      let successful = 0;
      let failed = 0;

      for (const templateUpdate of templates) {
        try {
          const { templateId, ...updates } = templateUpdate;
          
          if (!templateId) {
            results.push({
              templateId: null,
              success: false,
              error: 'Template ID is required'
            });
            failed++;
            continue;
          }

          const updatedTemplate = await this.templateService.updateTemplate(templateId, updates);
          
          results.push({
            templateId,
            success: true,
            data: updatedTemplate
          });
          successful++;
        } catch (error) {
          results.push({
            templateId: templateUpdate.templateId,
            success: false,
            error: error.message
          });
          failed++;
        }
      }

      res.json({
        success: true,
        data: {
          summary: {
            total: templates.length,
            successful,
            failed
          },
          results
        },
        message: `Bulk update completed: ${successful} successful, ${failed} failed`
      });
    } catch (error) {
      console.error('Bulk update templates error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to bulk update templates',
          details: error.message
        }
      });
    }
  }

  // Template validation
  async validateTemplate(req, res) {
    try {
      const { content, subject, variables = [] } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          error: { message: 'Content is required for validation' }
        });
      }

      const validation = {
        isValid: true,
        errors: [],
        warnings: []
      };

      try {
        // Test compile content
        const Handlebars = require('handlebars');
        Handlebars.compile(content);

        if (subject) {
          Handlebars.compile(subject);
        }

        // Check for common issues
        const variableRegex = /\{\{(.*?)\}\}/g;
        const usedVariables = [];
        let match;

        while ((match = variableRegex.exec(content)) !== null) {
          const variable = match[1].trim().split(' ')[0]; // Handle helpers
          if (!usedVariables.includes(variable)) {
            usedVariables.push(variable);
          }
        }

        if (subject) {
          while ((match = variableRegex.exec(subject)) !== null) {
            const variable = match[1].trim().split(' ')[0];
            if (!usedVariables.includes(variable)) {
              usedVariables.push(variable);
            }
          }
        }

        // Check for undefined variables
        const undefinedVariables = usedVariables.filter(v => !variables.includes(v));
        if (undefinedVariables.length > 0) {
          validation.warnings.push(`Variables used but not defined: ${undefinedVariables.join(', ')}`);
        }

        // Check for defined but unused variables
        const unusedVariables = variables.filter(v => !usedVariables.includes(v));
        if (unusedVariables.length > 0) {
          validation.warnings.push(`Variables defined but not used: ${unusedVariables.join(', ')}`);
        }

      } catch (error) {
        validation.isValid = false;
        validation.errors.push(`Template syntax error: ${error.message}`);
      }

      res.json({
        success: true,
        data: validation,
        message: 'Template validation completed'
      });
    } catch (error) {
      console.error('Validate template error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to validate template',
          details: error.message
        }
      });
    }
  }

  // Export templates
  async exportTemplates(req, res) {
    try {
      const { type, format = 'json' } = req.query;

      const templates = await this.templateService.listTemplates(
        type ? type.toUpperCase() : null,
        true
      );

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=templates.json');
        res.json(templates);
      } else {
        return res.status(400).json({
          success: false,
          error: { message: 'Unsupported export format' }
        });
      }
    } catch (error) {
      console.error('Export templates error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to export templates',
          details: error.message
        }
      });
    }
  }

  // Import templates
  async importTemplates(req, res) {
    try {
      const { templates } = req.body;

      if (!Array.isArray(templates) || templates.length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Templates array is required' }
        });
      }

      const results = [];
      let successful = 0;
      let failed = 0;

      for (const templateData of templates) {
        try {
          // Remove system fields
          delete templateData.templateId;
          delete templateData.createdAt;
          delete templateData.updatedAt;
          delete templateData.version;

          const template = await this.templateService.createTemplate(templateData);
          
          results.push({
            name: templateData.name,
            success: true,
            data: template
          });
          successful++;
        } catch (error) {
          results.push({
            name: templateData.name || 'Unknown',
            success: false,
            error: error.message
          });
          failed++;
        }
      }

      res.json({
        success: true,
        data: {
          summary: {
            total: templates.length,
            successful,
            failed
          },
          results
        },
        message: `Import completed: ${successful} successful, ${failed} failed`
      });
    } catch (error) {
      console.error('Import templates error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to import templates',
          details: error.message
        }
      });
    }
  }
}

module.exports = new NotificationTemplateController();