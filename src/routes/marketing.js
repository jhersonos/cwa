import { analyzeWorkflows } from '../services/marketing/workflows.analysis.js';
import { analyzeEmailsTeaser } from '../services/marketing/emails.teaser.js';
import { analyzeFormsTeaser } from '../services/marketing/forms.teaser.js';
import { analyzeLeadScoringTeaser } from '../services/marketing/leadScoring.teaser.js';
import { analyzeLandingPagesTeaser } from '../services/marketing/landingPages.teaser.js';
import { analyzeListsTeaser } from '../services/marketing/lists.teaser.js';
import { analyzeAeoHome } from '../services/marketing/aeoHome.analysis.js';

export default async function marketingRoutes(fastify, options) {
  
  /**
   * GET /api/marketing/workflows/:portalId
   * Analiza workflows de Marketing Hub para un portal
   */
  fastify.get('/workflows/:portalId', async (request, reply) => {
    try {
      const { portalId } = request.params;

      console.log(`\n🎯 [Marketing API] Solicitud de análisis de workflows`);
      console.log(`   Portal ID: ${portalId}`);

      // Validar portalId
      if (!portalId || isNaN(parseInt(portalId))) {
        return reply.code(400).send({
          success: false,
          error: 'Portal ID inválido'
        });
      }

      // Analizar workflows
      const analysis = await analyzeWorkflows(parseInt(portalId), fastify);

      console.log(`✅ [Marketing API] Análisis completado exitosamente`);

      return reply.code(200).send({
        success: true,
        portalId: parseInt(portalId),
        timestamp: new Date().toISOString(),
        data: analysis
      });

    } catch (error) {
      console.error('❌ [Marketing API] Error en /workflows:', error);
      console.error('❌ [Marketing API] Error stack:', error.stack);
      console.error('❌ [Marketing API] Error name:', error.name);
      
      return reply.code(500).send({
        success: false,
        error: error.message,
        errorName: error.name,
        message: 'Error al analizar workflows de marketing'
      });
    }
  });

  /**
   * GET /api/marketing/emails-teaser/:portalId
   * Teaser: máx 50 emails, solo metadata/agregados
   */
  fastify.get('/emails-teaser/:portalId', async (request, reply) => {
    try {
      const portalId = parseInt(request.params.portalId, 10);
      if (!portalId || isNaN(portalId)) return reply.code(400).send({ success: false, error: 'Portal ID inválido' });
      const data = await analyzeEmailsTeaser(portalId, fastify);
      return reply.code(200).send({ success: true, portalId, data });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/marketing/forms-teaser/:portalId
   * Teaser: máx 50 formularios, solo metadata
   */
  fastify.get('/forms-teaser/:portalId', async (request, reply) => {
    try {
      const portalId = parseInt(request.params.portalId, 10);
      if (!portalId || isNaN(portalId)) return reply.code(400).send({ success: false, error: 'Portal ID inválido' });
      const data = await analyzeFormsTeaser(portalId, fastify);
      return reply.code(200).send({ success: true, portalId, data });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/marketing/lead-scoring-teaser/:portalId
   * Diagnóstico básico: existe scoring, % sin score
   */
  fastify.get('/lead-scoring-teaser/:portalId', async (request, reply) => {
    try {
      const portalId = parseInt(request.params.portalId, 10);
      if (!portalId || isNaN(portalId)) return reply.code(400).send({ success: false, error: 'Portal ID inválido' });
      const data = await analyzeLeadScoringTeaser(portalId, fastify);
      return reply.code(200).send({ success: true, portalId, data });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/marketing/landing-pages-teaser/:portalId
   * Teaser: máx 50 landing pages, solo metadata
   */
  fastify.get('/landing-pages-teaser/:portalId', async (request, reply) => {
    try {
      const portalId = parseInt(request.params.portalId, 10);
      if (!portalId || isNaN(portalId)) return reply.code(400).send({ success: false, error: 'Portal ID inválido' });
      const data = await analyzeLandingPagesTeaser(portalId, fastify);
      return reply.code(200).send({ success: true, portalId, data });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/marketing/lists-teaser/:portalId
   * Teaser: máx 50 listas, metadata (sin uso, filtros vacíos, duplicados)
   */
  fastify.get('/lists-teaser/:portalId', async (request, reply) => {
    try {
      const portalId = parseInt(request.params.portalId, 10);
      if (!portalId || isNaN(portalId)) return reply.code(400).send({ success: false, error: 'Portal ID inválido' });
      const data = await analyzeListsTeaser(portalId, fastify);
      return reply.code(200).send({ success: true, portalId, data });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/marketing/aeo-home/:portalId
   * AEO del Home (Website Pages CMS + HTML público)
   */
  fastify.get('/aeo-home/:portalId', async (request, reply) => {
    try {
      const portalId = parseInt(request.params.portalId, 10);
      if (!portalId || isNaN(portalId)) return reply.code(400).send({ success: false, error: 'Portal ID inválido' });
      const data = await analyzeAeoHome(portalId, fastify);
      return reply.code(200).send({ success: true, portalId, data });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/marketing/health-check
   * Verifica que el módulo de marketing está funcionando
   */
  fastify.get('/health-check', async (request, reply) => {
    return reply.code(200).send({
      success: true,
      message: 'Marketing module is running',
      timestamp: new Date().toISOString()
    });
  });

}

