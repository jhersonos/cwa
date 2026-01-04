import { getScanHistory } from "../services/history/history.service.js";

/**
 * GET /api/scan-v3/history
 * Returns scan history for a portal
 */
export async function getScanHistoryHandler(req, reply) {
  const { portalId } = req.query;

  if (!portalId) {
    return reply.code(400).send({ error: "Missing portalId" });
  }

  try {
    const history = await getScanHistory(req.server, portalId);

    return {
      portalId,
      history
    };
  } catch (err) {
    req.server.log.error(
      { err, portalId },
      "Failed fetching scan history"
    );

    return reply.code(500).send({
      error: "Failed fetching scan history"
    });
  }
}
