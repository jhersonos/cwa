// src/routes/unlock.js
import { validateUnlockToken, checkUnlockStatus, logDownload } from "../services/unlock/token.service.js";
import { 
  generateAuditSummaryCSV,
  generateDealsWithoutOwnerCSV,
  generateDealsWithoutContactCSV,
  generateDealsWithoutAmountCSV,
  generateContactsWithoutEmailCSV,
  generateCompaniesWithoutPhoneCSV
} from "../services/unlock/export.service.js";
import { getValidAccessToken } from "../services/hubspot/token.service.js";
import { runScanV3 } from "../controllers/scan.controller.js";

export default async function unlockRoutes(fastify) {
  
  /**
   * POST /api/unlock/validate
   * Valida un token de desbloqueo
   */
  fastify.post("/api/unlock/validate", async (req, reply) => {
    const { portalId, token } = req.body;

    if (!portalId || !token) {
      return reply.code(400).send({ 
        error: "Missing required fields",
        message: "Se requiere portalId y token" 
      });
    }

    try {
      const result = await validateUnlockToken(fastify, portalId, token);
      
      if (result.valid) {
        return reply.send({
          valid: true,
          expiresAt: result.tokenData.expiresAt,
          message: "Token válido. Auditoría completa desbloqueada."
        });
      } else {
        return reply.code(401).send({
          valid: false,
          message: result.message
        });
      }
    } catch (error) {
      fastify.log.error({ err: error, portalId }, "Error validating token");
      return reply.code(500).send({ 
        error: "Validation failed",
        message: "Error al validar token" 
      });
    }
  });

  /**
   * GET /api/unlock/status
   * Verifica si un portal tiene desbloqueo activo
   */
  fastify.get("/api/unlock/status", async (req, reply) => {
    const { portalId } = req.query;

    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    try {
      const status = await checkUnlockStatus(fastify, portalId);
      return reply.send(status);
    } catch (error) {
      fastify.log.error({ err: error, portalId }, "Error checking unlock status");
      return reply.send({ unlocked: false, expiresAt: null });
    }
  });

  /**
   * GET /api/unlock/download/:reportType
   * Descarga un reporte específico en formato CSV
   */
  fastify.get("/api/unlock/download/:reportType", async (req, reply) => {
    const { reportType } = req.params;
    const { portalId, token } = req.query;

    if (!portalId || !token) {
      return reply.code(400).send({ 
        error: "Missing required parameters" 
      });
    }

    try {
      // Validar token
      const validation = await validateUnlockToken(fastify, portalId, token);
      
      if (!validation.valid) {
        return reply.code(401).send({ 
          error: "Unauthorized",
          message: "Token inválido o expirado"
        });
      }

      // Obtener token de HubSpot
      const hubspotToken = await getValidAccessToken(fastify, portalId);

      let csvContent = '';
      let filename = '';

      switch (reportType) {
        case 'audit-summary':
          // Ejecutar scan completo para obtener datos
          const scanData = await runScanV3({ query: { portalId }, server: fastify }, { send: () => {} });
          csvContent = await generateAuditSummaryCSV(scanData, portalId);
          filename = `audit-summary-${portalId}-${Date.now()}.csv`;
          break;

        case 'deals-without-owner':
          csvContent = await generateDealsWithoutOwnerCSV(fastify, portalId, hubspotToken);
          filename = `deals-without-owner-${portalId}-${Date.now()}.csv`;
          break;

        case 'deals-without-contact':
          // Necesitamos datos del último scan
          const dealsData = req.body?.dealsData || {};
          csvContent = await generateDealsWithoutContactCSV(fastify, portalId, hubspotToken, dealsData);
          filename = `deals-without-contact-${portalId}-${Date.now()}.csv`;
          break;

        case 'deals-without-amount':
          const dealsDataAmount = req.body?.dealsData || {};
          csvContent = await generateDealsWithoutAmountCSV(fastify, portalId, hubspotToken, dealsDataAmount);
          filename = `deals-without-amount-${portalId}-${Date.now()}.csv`;
          break;

        case 'contacts-without-email':
          csvContent = await generateContactsWithoutEmailCSV(fastify, portalId, hubspotToken);
          filename = `contacts-without-email-${portalId}-${Date.now()}.csv`;
          break;

        case 'companies-without-phone':
          csvContent = await generateCompaniesWithoutPhoneCSV(fastify, portalId, hubspotToken);
          filename = `companies-without-phone-${portalId}-${Date.now()}.csv`;
          break;

        default:
          return reply.code(404).send({ 
            error: "Report type not found" 
          });
      }

      // Registrar descarga
      await logDownload(fastify, portalId, token, 'csv', reportType);

      // Enviar archivo
      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csvContent);

    } catch (error) {
      fastify.log.error({ err: error, portalId, reportType }, "Error generating download");
      return reply.code(500).send({ 
        error: "Download failed",
        message: "Error al generar descarga" 
      });
    }
  });
}

