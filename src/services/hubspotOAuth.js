import axios from "axios";

/**
 * Obtiene un access_token válido.
 * Si está expirado, usa refresh_token automáticamente.
 */
export async function getValidAccessToken(fastify, portalId) {
  const [rows] = await fastify.db.execute(
    "SELECT access_token, refresh_token, expires_at FROM portals WHERE portal_id = ?",
    [portalId]
  );

  if (!rows.length) {
    throw new Error("Portal not connected");
  }

  const { access_token, refresh_token, expires_at } = rows[0];

  // ⏱️ Token aún válido (con margen de 1 min)
  if (expires_at && new Date(expires_at).getTime() > Date.now() + 60_000) {
    return access_token;
  }

  // 🔁 REFRESH TOKEN
  const res = await axios.post(
    "https://api.hubapi.com/oauth/v1/token",
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.HUBSPOT_CLIENT_ID,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET,
      refresh_token
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }
  );

  const {
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    expires_in
  } = res.data;

  const newExpiresAt = new Date(Date.now() + expires_in * 1000);

  await fastify.db.execute(
    `
    UPDATE portals
    SET access_token = ?, refresh_token = ?, expires_at = ?
    WHERE portal_id = ?
    `,
    [newAccessToken, newRefreshToken, newExpiresAt, portalId]
  );

  fastify.log.info({ portalId }, "🔁 OAuth token refreshed");

  return newAccessToken;
}
