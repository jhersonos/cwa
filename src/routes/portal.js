import { trackPortalUsage } from "../services/portal/portal.service.js";

export default async function portalRoutes(fastify) {
  /**
   * POST /api/portal/track
   * La app HubSpot envía portalId + email del usuario en contexto.
   */
  fastify.post("/api/portal/track", async (req, reply) => {
    const { portalId, email, firstName, lastName, source } = req.body || {};

    if (!portalId || !email) {
      return reply.code(400).send({
        error: "Missing fields",
        message: "Se requiere portalId y email"
      });
    }

    try {
      const result = await trackPortalUsage(fastify, {
        portalId,
        email,
        firstName,
        lastName,
        source: source || "app"
      });
      if (!result.ok) {
        return reply.code(404).send(result);
      }
      return reply.send({ success: true, ...result });
    } catch (err) {
      fastify.log.error({ err, portalId }, "portal track failed");
      return reply.code(500).send({
        error: "Track failed",
        message: err.message
      });
    }
  });
}
