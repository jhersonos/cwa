import { hubspotRequest } from "./hubspotRequest.js";

/**
 * Obtiene todos los usuarios del portal
 */
export async function fetchAllUsers(fastify, portalId, token) {
  const res = await hubspotRequest(
    fastify,
    portalId,
    token,
    "/settings/v3/users"
  );

  return Array.isArray(res?.results) ? res.results : [];
}
