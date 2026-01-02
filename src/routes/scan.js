import { hubspotRequest } from "../services/hubspot.js";

export default async function scanRoutes(fastify) {
  // Endpoint para obtener el portal ID
  fastify.get("/api/portal-id", async (req, reply) => {
    try {
      // Obtener todos los portales conectados
      const [rows] = await fastify.db.execute(
        "SELECT portal_id FROM portals ORDER BY portal_id LIMIT 1"
      );

      if (!rows.length) {
        return reply.code(404).send({ error: "No portal connected" });
      }

      return { portalId: rows[0].portal_id };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  fastify.get("/api/scan", async (req, reply) => {
    const { portalId } = req.query;

    if (!portalId) {
      return reply.code(400).send({ error: "portalId required" });
    }

    // 1️⃣ Obtener token
    const [rows] = await fastify.db.execute(
      "SELECT access_token FROM portals WHERE portal_id = ?",
      [portalId]
    );

    if (!rows.length) {
      return reply.code(401).send({ error: "Portal not connected" });
    }

    const token = rows[0].access_token;

    // 2️⃣ Contactos
    const contacts = await hubspotRequest(
      token,
      "/crm/v3/objects/contacts?limit=100"
    );

    const totalContacts = contacts.total || contacts.results.length;

    // 3️⃣ Usuarios
    const users = await hubspotRequest(
      token,
      "/settings/v3/users"
    );

    const totalUsers = users.results.length;

    // 4️⃣ Cost estimation (simplificada)
    const estimatedWasteUSD =
      Math.max(0, totalContacts - 1000) * 0.04 +
      Math.max(0, totalUsers - 2) * 50;

    return {
      portalId,
      contacts: totalContacts,
      users: totalUsers,
      estimatedMonthlyWasteUSD: Math.round(estimatedWasteUSD)
    };
  });
}
