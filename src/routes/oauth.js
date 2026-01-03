import axios from "axios";

export default async function oauthRoutes(fastify) {
  const {
    HUBSPOT_CLIENT_ID,
    HUBSPOT_CLIENT_SECRET,
    BASE_URL
  } = process.env;

  fastify.get("/oauth/start", async (req, reply) => {
    const scopes = [
      "crm.objects.contacts.read",
      "crm.objects.companies.read",
      "crm.objects.deals.read",
      "crm.objects.owners.read",
      "settings.users.read",
      "automation" // 👈 CLAVE
    ].join(" ");

    const authUrl =
      "https://app.hubspot.com/oauth/authorize" +
      `?client_id=${HUBSPOT_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(
        `${BASE_URL}/oauth/callback`
      )}` +
      `&scope=${encodeURIComponent(scopes)}`;

    reply.redirect(authUrl);
  });

  fastify.get("/oauth/callback", async (req, reply) => {

    console.log("CLIENT_ID:", HUBSPOT_CLIENT_ID);

    const { code } = req.query;

    if (!code) {
      return reply.code(400).send("Missing code");
    }

    try {
      const tokenRes = await axios.post(
        "https://api.hubapi.com/oauth/v1/token",
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: HUBSPOT_CLIENT_ID,
          client_secret: HUBSPOT_CLIENT_SECRET,
          redirect_uri: `${BASE_URL}/oauth/callback`,
          code
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );

      const {
        access_token,
        refresh_token,
        expires_in,
        hub_id
      } = tokenRes.data;

      const expiresAt = new Date(
        Date.now() + expires_in * 1000
      );

      await fastify.db.execute(
        `
        INSERT INTO portals (portal_id, access_token, refresh_token, expires_at)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          access_token = VALUES(access_token),
          refresh_token = VALUES(refresh_token),
          expires_at = VALUES(expires_at)
        `,
        [hub_id, access_token, refresh_token, expiresAt]
      );

      reply.type("text/html").send(`
        <h2>✅ HubSpot Connected</h2>
        <p>Portal ID: ${hub_id}</p>
        <p>You can close this window.</p>
      `);
    } catch (err) {
      fastify.log.error(err.response?.data || err.message);
      reply.code(500).send("OAuth failed");
    }
  });
}
