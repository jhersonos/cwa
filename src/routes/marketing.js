import { analyzeWorkflows } from '../services/marketing/workflows.analysis.js';

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

