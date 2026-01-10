// src/routes/contactsDetails.js
import axios from "axios";
import { getValidAccessToken } from "../services/hubspot/token.service.js";

const HUBSPOT_API = "https://api.hubapi.com";

export default async function contactsDetailsRoutes(fastify) {
  /**
   * GET /api/contacts/incomplete
   * Obtiene contactos con datos incompletos para mostrar en modal
   */
  fastify.get("/api/contacts/incomplete", async (req, reply) => {
    const { portalId } = req.query;

    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    try {
      const token = await getValidAccessToken(fastify, portalId);

      // Fetch contactos
      const res = await axios.get(`${HUBSPOT_API}/crm/v3/objects/contacts`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          limit: 100,
          properties: [
            "firstname",
            "lastname",
            "email",
            "phone",
            "mobilephone",
            "lifecyclestage",
            "hs_lastmodifieddate"
          ].join(",")
        },
        timeout: 5000
      });

      const contacts = res.data?.results || [];

      // Filtrar contactos con problemas
      const incomplete = contacts.filter(c => {
        const p = c.properties;
        return !p.email || !p.phone && !p.mobilephone || !p.lifecyclestage;
      });

      // Mapear a formato simple
      const result = incomplete.map(c => {
        const p = c.properties;
        return {
          id: c.id,
          firstname: p.firstname || '',
          lastname: p.lastname || '',
          email: p.email || '',
          phone: p.phone || p.mobilephone || '',
          lifecyclestage: p.lifecyclestage || '',
          issues: [
            !p.email ? 'Sin email' : null,
            !p.phone && !p.mobilephone ? 'Sin teléfono' : null,
            !p.lifecyclestage ? 'Sin lifecycle' : null
          ].filter(Boolean).join(', ')
        };
      });

      return reply.send({
        contacts: result,
        total: result.length
      });

    } catch (error) {
      fastify.log.error({ err: error, portalId }, "Error fetching incomplete contacts");
      return reply.code(500).send({
        error: "Failed to fetch contacts",
        message: error.message
      });
    }
  });
}

