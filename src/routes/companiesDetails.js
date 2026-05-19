import { getValidAccessToken } from "../services/hubspot/token.service.js";
import {
  crmSearchFetch,
  msAgo,
} from "../services/hubspot/crmSearchTotals.service.js";
import { checkUnlockStatus } from "../services/unlock/token.service.js";

const COMPANY_PROPERTIES = [
  "name",
  "domain",
  "hubspot_owner_id",
  "hs_lastmodifieddate",
  "phone",
];

function normalizeCompany(company) {
  const p = company.properties || {};
  return {
    id: company.id,
    name: p.name || `Empresa ${company.id}`,
    domain: p.domain || "",
    lastModified: p.hs_lastmodifieddate || null,
    phone: p.phone || "",
  };
}

export default async function companiesDetailsRoutes(fastify) {
  /**
   * GET /api/companies/inactive
   * Empresas sin actividad >90 días (para scan-details y modal).
   */
  fastify.get("/api/companies/inactive", async (req, reply) => {
    const { portalId } = req.query;

    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    try {
      const token = await getValidAccessToken(fastify, portalId);
      const unlock = await checkUnlockStatus(fastify, portalId);
      const maxResults = unlock.unlocked ? 500 : 100;

      const filterGroups = [
        {
          filters: [
            {
              propertyName: "hs_lastmodifieddate",
              operator: "LT",
              value: msAgo(90),
            },
          ],
        },
      ];

      const raw = await crmSearchFetch(token, "companies", filterGroups, {
        properties: COMPANY_PROPERTIES,
        maxResults,
      });

      const companies = raw.map(normalizeCompany);

      return reply.send({
        companies,
        total: companies.length,
        capped: companies.length >= maxResults,
      });
    } catch (error) {
      fastify.log.error({ err: error, portalId }, "Error fetching inactive companies");
      return reply.code(500).send({
        error: "Failed to fetch companies",
        message: error.message,
      });
    }
  });
}
