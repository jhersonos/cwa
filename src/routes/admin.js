import {
  verifyAdminCredentials,
  issueAdminToken,
  verifyAdminToken,
  extractBearerToken
} from "../services/admin/adminAuth.service.js";
import {
  getAdminDashboard,
  activateProForPortal,
  revokeProForPortal,
  updatePortalAdminNotes
} from "../services/portal/portal.service.js";

function requireAdmin(fastify) {
  return async function adminPreHandler(req, reply) {
    const token = extractBearerToken(req);
    const session = verifyAdminToken(token);
    if (!session.valid) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Sesión inválida o expirada"
      });
    }
    req.adminUser = { email: session.email };
  };
}

export default async function adminRoutes(fastify) {
  const guard = requireAdmin(fastify);

  fastify.post("/api/admin/login", async (req, reply) => {
    const { email, password } = req.body || {};
    const check = verifyAdminCredentials(email, password);
    if (!check.ok) {
      return reply.code(401).send({ error: "Unauthorized", message: check.error });
    }
    const { token, expiresAt } = issueAdminToken(email);
    return reply.send({
      success: true,
      token,
      expiresAt,
      email: (email || "").trim().toLowerCase()
    });
  });

  fastify.get(
    "/api/admin/me",
    { preHandler: guard },
    async (req) => ({
      ok: true,
      email: req.adminUser.email
    })
  );

  fastify.get(
    "/api/admin/dashboard",
    { preHandler: guard },
    async (req, reply) => {
      try {
        const data = await getAdminDashboard(fastify);
        return reply.send({ success: true, ...data });
      } catch (err) {
        fastify.log.error({ err }, "Admin dashboard failed");
        return reply.code(500).send({
          error: "Dashboard failed",
          message: err.message
        });
      }
    }
  );

  fastify.post(
    "/api/admin/portals/:portalId/activate-pro",
    { preHandler: guard },
    async (req, reply) => {
      const { portalId } = req.params;
      const { days = 365, email, paymentReference } = req.body || {};
      try {
        const result = await activateProForPortal(fastify, portalId, {
          days,
          email,
          paymentReference: paymentReference || "ADMIN_MANUAL"
        });
        if (!result.ok) {
          return reply.code(400).send(result);
        }
        return reply.send({ success: true, ...result });
      } catch (err) {
        fastify.log.error({ err, portalId }, "activate-pro failed");
        return reply.code(500).send({
          error: "Activation failed",
          message: err.message
        });
      }
    }
  );

  fastify.post(
    "/api/admin/portals/:portalId/revoke-pro",
    { preHandler: guard },
    async (req, reply) => {
      const { portalId } = req.params;
      try {
        const result = await revokeProForPortal(fastify, portalId);
        return reply.send({ success: true, ...result });
      } catch (err) {
        fastify.log.error({ err, portalId }, "revoke-pro failed");
        return reply.code(500).send({
          error: "Revoke failed",
          message: err.message
        });
      }
    }
  );

  fastify.patch(
    "/api/admin/portals/:portalId",
    { preHandler: guard },
    async (req, reply) => {
      const { portalId } = req.params;
      const { adminNotes, installerEmail } = req.body || {};
      try {
        const result = await updatePortalAdminNotes(fastify, portalId, {
          adminNotes,
          installerEmail
        });
        if (!result.ok) {
          return reply.code(400).send(result);
        }
        return reply.send({ success: true });
      } catch (err) {
        fastify.log.error({ err, portalId }, "patch portal failed");
        return reply.code(500).send({
          error: "Update failed",
          message: err.message
        });
      }
    }
  );
}
