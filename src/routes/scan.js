// src/routes/scan.js
import { hubspotRequest } from "../services/hubspot.js";

const scanCache = new Map();

/* -------------------------
   HELPERS
------------------------- */

async function getAllContacts(token) {
  let after;
  let total = 0;

  do {
    const res = await hubspotRequest(
      token,
      `/crm/v3/objects/contacts?limit=100${after ? `&after=${after}` : ""}`
    );

    total += res.results?.length || 0;
    after = res.paging?.next?.after;
  } while (after);

  return total;
}

function calculateEfficiencyScore(totalContacts, totalUsers, inactiveUsers) {
  let score = 100;

  if (totalUsers > 0) {
    const ratio = totalContacts / totalUsers;
    if (ratio > 5000) score -= 20;
    else if (ratio > 3000) score -= 10;
  }

  if (totalUsers > 0) {
    const inactiveRatio = inactiveUsers / totalUsers;
    if (inactiveRatio > 0.3) score -= 25;
    else if (inactiveRatio > 0.2) score -= 15;
    else if (inactiveRatio > 0.1) score -= 5;
  }

  if (totalContacts > 50000) score -= 15;
  else if (totalContacts > 20000) score -= 5;

  // 🔒 guardrail: nunca menos de 40 ni más de 100
  return Math.max(40, Math.min(100, Math.round(score)));
}

function calculateContactRiskLevel(totalContacts, totalUsers) {
  if (totalUsers === 0) return "medium";

  const ratio = totalContacts / totalUsers;
  if (ratio > 5000) return "high";
  if (ratio > 3000) return "medium";
  return "low";
}

function detectIssues(totalContacts, totalUsers, inactiveUsers) {
  const issues = [];

  const ratio = totalContacts / totalUsers;
  const inactiveRatio = totalUsers ? inactiveUsers / totalUsers : 0;

  if (ratio > 5000) {
    issues.push("Very high contact-to-user ratio detected");
  }

  if (inactiveRatio > 0.3) {
    issues.push("High percentage of inactive users");
  }

  if (totalContacts > 50000) {
    issues.push("Large contact database may need optimization");
  }

  if (!issues.length) {
    issues.push("No significant issues detected");
  }

  return issues;
}

/* -------------------------
   ROUTE
------------------------- */

export default async function scanRoutes(fastify) {
  fastify.get("/api/scan", async (req, reply) => {
    // ✅ HubSpot UI Extensions envían portalId como query
    const portalId =
      req.query.portalId ||
      req.headers["x-portal-id"]; // fallback futuro

    if (!portalId) {
      return reply.code(401).send({
        error: "Missing portal context"
      });
    }

    // Cache por portal (1 min)
    const cached = scanCache.get(portalId);
    if (cached && Date.now() - cached.timestamp < 60_000) {
      return cached.result;
    }

    // Obtener token OAuth del portal correcto
    const [rows] = await fastify.db.execute(
      "SELECT access_token FROM portals WHERE portal_id = ?",
      [portalId]
    );

    if (!rows.length) {
      return reply.code(401).send({
        error: "Portal not connected"
      });
    }

    const token = rows[0].access_token;

    /* -------------------------
       CONTACTS
    ------------------------- */
    const totalContacts = await getAllContacts(token);

    /* -------------------------
       USERS
    ------------------------- */
    let usersRes;
    try {
      usersRes = await hubspotRequest(token, "/settings/v3/users");
    } catch {
      usersRes = null;
    }

    // Fallback seguro para Free accounts
    const totalUsers = usersRes?.results?.length || 1;

    const inactiveUsers = usersRes?.results
      ? usersRes.results.filter(
          (u) => u.isSuspended || !u.email
        ).length
      : 0;

    /* -------------------------
       METRICS
    ------------------------- */
    const efficiencyScore = calculateEfficiencyScore(
      totalContacts,
      totalUsers,
      inactiveUsers
    );

    const contactRiskLevel = calculateContactRiskLevel(
      totalContacts,
      totalUsers
    );

    const detectedIssues = detectIssues(
      totalContacts,
      totalUsers,
      inactiveUsers
    );

    const result = {
      portalId: String(portalId),
      efficiencyScore,
      totalContacts,
      totalUsers,
      inactiveUsers,
      contactRiskLevel,
      detectedIssues
    };

    scanCache.set(portalId, {
      timestamp: Date.now(),
      result
    });

    return result;
  });
}
