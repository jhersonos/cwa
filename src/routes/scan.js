import { hubspotRequest } from "../services/hubspot.js";

const scanCache = new Map();

/* =========================
   DEBUG HELPERS
========================= */

function logSection(fastify, title) {
  fastify.log.info(" ");
  fastify.log.info("====================================");
  fastify.log.info(title);
  fastify.log.info("====================================");
}

/* =========================
   CONTACTS
========================= */

async function getAllContacts(token, fastify) {
  let after = undefined;
  let total = 0;
  let page = 1;

  do {
    fastify.log.info(`[CONTACTS] Fetch page ${page} | after=${after || "none"}`);

    const res = await hubspotRequest(
      token,
      `/crm/v3/objects/contacts?limit=100${after ? `&after=${after}` : ""}`
    );

    fastify.log.info(
      `[CONTACTS] Response keys: ${Object.keys(res || {}).join(", ")}`
    );

    fastify.log.info(
      `[CONTACTS] Results length: ${res?.results?.length || 0}`
    );

    total += res?.results?.length || 0;
    after = res?.paging?.next?.after;

    page++;
  } while (after);

  fastify.log.info(`[CONTACTS] TOTAL CONTACTS COUNTED: ${total}`);

  return total;
}

/* =========================
   USERS
========================= */

async function getUsers(token, fastify) {
  try {
    const res = await hubspotRequest(token, "/settings/v3/users");

    fastify.log.info(
      `[USERS] Response keys: ${Object.keys(res || {}).join(", ")}`
    );
    fastify.log.info(
      `[USERS] Users length: ${res?.results?.length || 0}`
    );

    if (res?.results?.length) {
      res.results.forEach((u, i) => {
        fastify.log.info(
          `[USERS] #${i + 1} | email=${u.email} | suspended=${u.isSuspended}`
        );
      });
    }

    return res;
  } catch (err) {
    fastify.log.error("[USERS] ERROR calling users endpoint", err);
    return null;
  }
}

/* =========================
   ROUTES
========================= */

export default async function scanRoutes(fastify) {
  fastify.get("/api/scan", async (req, reply) => {
    logSection(fastify, "SCAN REQUEST RECEIVED");

    fastify.log.info("HEADERS RECEIVED:");
    Object.entries(req.headers).forEach(([k, v]) => {
      fastify.log.info(`  ${k}: ${v}`);
    });

    /* -------------------------
       PORTAL CONTEXT
    ------------------------- */

    const headerPortalId =
      req.headers["x-portal-id"] ||
      req.headers["x-hubspot-portal-id"] ||
      req.headers["x-hubspot-account-id"];

    fastify.log.info(`HEADER portalId: ${headerPortalId || "NONE"}`);

    logSection(fastify, "DATABASE PORTALS");

    const [rows] = await fastify.db.execute(
      "SELECT portal_id, access_token FROM portals"
    );

    fastify.log.info(`Portals in DB: ${rows.length}`);

    rows.forEach((r, i) => {
      fastify.log.info(
        `#${i + 1} portal_id=${r.portal_id} token_present=${!!r.access_token}`
      );
    });

    if (!rows.length) {
      fastify.log.error("NO PORTALS IN DATABASE");
      return reply.code(401).send({ error: "No portals connected" });
    }

    /* ⚠️ DEBUG MODE: always use FIRST portal */
    const portalId = rows[0].portal_id;
    const token = rows[0].access_token;

    fastify.log.info(`USING portalId=${portalId}`);

    /* -------------------------
       CACHE
    ------------------------- */

    const cacheKey = String(portalId);
    const cached = scanCache.get(cacheKey);

    if (cached) {
      fastify.log.info("RETURNING CACHED RESULT");
      return cached.result;
    }

    try {
      /* -------------------------
         CONTACTS
      ------------------------- */

      logSection(fastify, "FETCHING CONTACTS");
      const totalContacts = await getAllContacts(token, fastify);

      /* -------------------------
         USERS
      ------------------------- */

      logSection(fastify, "FETCHING USERS");
      const usersRes = await getUsers(token, fastify);
      const totalUsers = usersRes?.results?.length || 0;

      /* -------------------------
         INACTIVE USERS
      ------------------------- */

      const inactiveUsers = usersRes?.results
        ? usersRes.results.filter(
            (u) => u.isSuspended || !u.email
          ).length
        : 0;

      fastify.log.info(`Inactive users: ${inactiveUsers}`);

      /* -------------------------
         FINAL RESULT
      ------------------------- */

      const result = {
        portalId: String(portalId),
        efficiencyScore: 999, // 🔴 TEMPORAL PARA DEBUG
        totalContacts,
        totalUsers,
        inactiveUsers,
        contactRiskLevel: "low",
        detectedIssues: ["DEBUG MODE ENABLED"]
      };

      fastify.log.info("FINAL RESULT:");
      fastify.log.info(JSON.stringify(result, null, 2));

      scanCache.set(cacheKey, {
        timestamp: Date.now(),
        result
      });

      return result;
    } catch (error) {
      fastify.log.error("SCAN FAILED", error);
      return reply.code(500).send({
        error: "Scan failed",
        details: error.message
      });
    }
  });
}
