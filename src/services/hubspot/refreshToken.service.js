// services/refreshToken.js
import axios from "axios";

export async function refreshPortalToken(fastify, portalId) {
  const {
    HUBSPOT_CLIENT_ID,
    HUBSPOT_CLIENT_SECRET
  } = process.env;

  const [[portal]] = await fastify.db.execute(
    "SELECT refresh_token FROM portals WHERE portal_id = ?",
    [portalId]
  );

  if (!portal?.refresh_token) {
    throw new Error("No refresh token available for this portal");
  }

  const res = await axios.post(
    "https://api.hubapi.com/oauth/v1/token",
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: HUBSPOT_CLIENT_ID,
      client_secret: HUBSPOT_CLIENT_SECRET,
      refresh_token: portal.refresh_token
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const { access_token, refresh_token, expires_in } = res.data;
  const expiresAt = new Date(Date.now() + expires_in * 1000);

  await fastify.db.execute(
    `
    UPDATE portals
    SET access_token = ?, refresh_token = ?, expires_at = ?
    WHERE portal_id = ?
    `,
    [access_token, refresh_token, expiresAt, portalId]
  );

  return access_token;
}
