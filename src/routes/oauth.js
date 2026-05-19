// src/routes/oauth.js
import axios from "axios";
import { enrichPortalFromHubSpot } from "../services/portal/portal.service.js";

export default async function oauthRoutes(fastify) {
  const {
    HUBSPOT_CLIENT_ID,
    HUBSPOT_CLIENT_SECRET,
    BASE_URL
  } = process.env;

  fastify.get("/oauth/start", async (req, reply) => {
    // Solo scopes con uso real en la API. crm.objects.owners.read se omite: el owner se lee vía
    // propiedades hubspot_owner_id con crm.objects.*.read. crm.schemas.deals.read y
    // crm.objects.line_items.read no tenían endpoints. settings.users.read se removió temporalmente
    // mientras el análisis de usuarios queda desactivado para Marketplace review.
    const scopes = [
      "oauth",
      "crm.objects.contacts.read",
      "crm.objects.companies.read",
      "crm.objects.deals.read",
      "crm.lists.read",
      "crm.lists.write",
      "tickets",
      "automation",
      "forms",
      "content"
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

    console.log("=== OAUTH CALLBACK INICIADO ===");
    console.log("CLIENT_ID:", HUBSPOT_CLIENT_ID);
    console.log("Query params:", req.query);

    const { code } = req.query;

    if (!code) {
      console.log("ERROR: No se recibió código OAuth");
      return reply.code(400).send("Missing code");
    }

    console.log("Código OAuth recibido:", code.substring(0, 20) + "...");

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

      console.log("✅ Tokens recibidos de HubSpot:");
      console.log("  - hub_id:", hub_id);
      console.log("  - expires_in:", expires_in);
      console.log("  - access_token:", access_token.substring(0, 20) + "...");
      
      const expiresAt = new Date(
        Date.now() + expires_in * 1000
      );

      console.log("💾 Guardando en base de datos...");
      
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

      enrichPortalFromHubSpot(fastify, hub_id, access_token).catch((err) => {
        fastify.log.warn({ err: err.message, hub_id }, "Portal enrich after OAuth failed");
      });

      console.log("✅ Guardado exitoso. Redirigiendo a success page...");

      reply.redirect(`/oauth-success.html?portalId=${hub_id}`);

    } catch (err) {
      console.error("❌ ERROR EN OAUTH CALLBACK:");
      console.error("  - Mensaje:", err.message);
      if (err.response) {
        console.error("  - Status:", err.response.status);
        console.error("  - Data:", err.response.data);
      }
      console.error("  - Stack:", err.stack);
      
      fastify.log.error(err.response?.data || err.message);
      reply.code(500).send({
        error: "OAuth failed",
        message: err.response?.data?.message || err.message,
        details: err.response?.data
      });
    }
  });
}
