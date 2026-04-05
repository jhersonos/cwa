// src/routes/payment.js
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import {
  createUnlockTokenAfterPayment,
  getUnlockDurationDays,
  getUnlockPriceUsd,
} from "../services/payment/unlockFromPayment.service.js";
import {
  createPayPalOrder,
  capturePayPalOrder,
  isPayPalConfigured,
} from "../services/payment/paypal.service.js";

/** Credenciales de prueba MP usan token que empieza por TEST-; el checkout debe usar sandbox_init_point, no init_point. */
function isMercadoPagoSandboxToken(token) {
  return typeof token === "string" && token.startsWith("TEST-");
}

export default async function paymentRoutes(fastify) {
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const client = mpToken
    ? new MercadoPagoConfig({ accessToken: mpToken })
    : null;

  const preferenceClient = client ? new Preference(client) : null;
  const paymentClient = client ? new Payment(client) : null;

  /**
   * GET /api/payment/config
   * Precio y duración para checkout público
   */
  fastify.get("/api/payment/config", async (_req, reply) => {
    return reply.send({
      priceUsd: getUnlockPriceUsd(),
      durationDays: getUnlockDurationDays(),
      currency: "USD",
      mercadoPagoEnabled: !!mpToken,
      mercadoPagoSandbox: isMercadoPagoSandboxToken(mpToken),
      paypalEnabled: isPayPalConfigured(),
    });
  });

  /**
   * POST /api/payment/create-preference
   * Crea una preferencia de pago en MercadoPago
   */
  fastify.post("/api/payment/create-preference", async (req, reply) => {
    const { portalId, email } = req.body;

    if (!portalId || !email) {
      return reply.code(400).send({
        error: "Missing required fields",
        message: "Se requiere portalId y email",
      });
    }

    if (!preferenceClient || !mpToken) {
      return reply.code(503).send({
        error: "Payment unavailable",
        message: "Mercado Pago no está configurado en el servidor.",
      });
    }

    const unitPrice = getUnlockPriceUsd();

    try {
      const preference = await preferenceClient.create({
        body: {
          items: [
            {
              id: "cwa-unlock-1m",
              title: "Auditoría Completa - Cost CRM Risk Scanner",
              description: `Desbloqueo 1 mes (${getUnlockDurationDays()} días) — exportaciones y listas`,
              category_id: "services",
              quantity: 1,
              currency_id: "USD",
              unit_price: unitPrice,
            },
          ],
          payer: {
            email: email
          },
          metadata: {
            portal_id: portalId,
            email: email
          },
          back_urls: {
            success: `${process.env.BASE_URL || 'https://cwa.estado7.com'}/payment/success`,
            failure: `${process.env.BASE_URL || 'https://cwa.estado7.com'}/payment/failure`,
            pending: `${process.env.BASE_URL || 'https://cwa.estado7.com'}/payment/pending`
          },
          auto_return: 'approved',
          notification_url: `${process.env.BASE_URL || 'https://cwa.estado7.com'}/api/payment/webhook`,
          statement_descriptor: 'CWA AUDIT',
          external_reference: `CWA-${portalId}-${Date.now()}`
        }
      });

      const sandbox = isMercadoPagoSandboxToken(mpToken);
      const checkoutUrl = sandbox
        ? preference.sandbox_init_point || preference.init_point
        : preference.init_point || preference.sandbox_init_point;

      fastify.log.info(
        { portalId, preferenceId: preference.id, sandbox, hasCheckoutUrl: !!checkoutUrl },
        "Payment preference created"
      );

      return reply.send({
        id: preference.id,
        init_point: preference.init_point,
        sandbox_init_point: preference.sandbox_init_point,
        /** URL correcta según credenciales (sandbox vs producción). El cliente debe redirigir aquí. */
        checkout_url: checkoutUrl,
      });

    } catch (error) {
      fastify.log.error({ err: error, portalId }, "Error creating payment preference");
      return reply.code(500).send({
        error: "Preference creation failed",
        message: error.message,
      });
    }
  });

  const basePublicUrl = () =>
    (process.env.BASE_URL || "https://cwa.estado7.com").replace(/\/$/, "");

  /**
   * POST /api/payment/paypal/create-order
   */
  fastify.post("/api/payment/paypal/create-order", async (req, reply) => {
    const { portalId, email } = req.body;

    if (!portalId || !email) {
      return reply.code(400).send({
        error: "Missing required fields",
        message: "Se requiere portalId y email",
      });
    }

    if (!isPayPalConfigured()) {
      return reply.code(503).send({
        error: "PayPal unavailable",
        message: "PayPal no está configurado en el servidor.",
      });
    }

    try {
      const base = basePublicUrl();
      const { orderId, approvalUrl } = await createPayPalOrder({
        amountUsd: getUnlockPriceUsd(),
        portalId: String(portalId),
        email: String(email),
        returnUrl: `${base}/api/payment/paypal/return`,
        cancelUrl: `${base}/payment/failure`,
      });

      fastify.log.info({ portalId, orderId }, "PayPal order created");

      return reply.send({ orderId, approvalUrl });
    } catch (error) {
      fastify.log.error({ err: error, portalId }, "PayPal create-order failed");
      return reply.code(500).send({
        error: "PayPal order failed",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/payment/paypal/return
   * PayPal redirige con ?token=ORDER_ID
   */
  fastify.get("/api/payment/paypal/return", async (req, reply) => {
    const orderId = req.query.token;
    const base = basePublicUrl();

    if (!orderId) {
      return reply.redirect(`${base}/payment/failure`);
    }

    try {
      const captured = await capturePayPalOrder(orderId);
      const pu = captured.purchase_units?.[0];
      const captureId = pu?.payments?.captures?.[0]?.id;

      let portalId = "";
      let email = "";
      try {
        const raw = pu?.custom_id;
        if (raw) {
          const custom = JSON.parse(raw);
          portalId = String(custom.p || "");
          email = String(custom.e || "");
        }
      } catch (parseErr) {
        fastify.log.warn({ parseErr, orderId }, "PayPal custom_id parse");
      }

      if (!portalId) {
        fastify.log.error({ orderId }, "PayPal return: falta portalId");
        return reply.redirect(`${base}/payment/failure`);
      }

      const paymentRef = captureId ? `paypal-${captureId}` : `paypal-${orderId}`;

      await createUnlockTokenAfterPayment(fastify, {
        portalId,
        paymentReference: paymentRef,
        email,
      });

      return reply.redirect(
        `${base}/payment/success?status=approved&payment_ref=${encodeURIComponent(paymentRef)}`
      );
    } catch (error) {
      fastify.log.error({ err: error, orderId }, "PayPal return failed");
      return reply.redirect(`${base}/payment/failure`);
    }
  });

  /**
   * POST /api/payment/webhook
   * Webhook para notificaciones de MercadoPago
   */
  fastify.post("/api/payment/webhook", async (req, reply) => {
    try {
      const { type, data } = req.body;

      fastify.log.info({ type, data, body: req.body }, "Received payment webhook");

      if (type === "payment" && paymentClient) {
        const paymentId = data.id;

        const payment = await paymentClient.get({ id: paymentId });

        fastify.log.info(
          {
            paymentId,
            status: payment.status,
            metadata: payment.metadata,
            payer: payment.payer?.email,
          },
          "Payment info retrieved"
        );

        if (payment.status === "approved") {
          const portalId = String(payment.metadata?.portal_id ?? "");
          const email = payment.metadata?.email || payment.payer?.email;

          if (!portalId) {
            fastify.log.warn({ paymentId }, "MP webhook: sin portal_id en metadata");
          } else {
            await createUnlockTokenAfterPayment(fastify, {
              portalId,
              paymentReference: String(paymentId),
              email,
            });
          }
        }
      }

      return reply.code(200).send({ received: true });
    } catch (error) {
      fastify.log.error({ 
        err: error, 
        message: error.message,
        stack: error.stack 
      }, "❌ Error processing webhook");
      // Siempre responder 200 a webhooks para no reintentarlos
      return reply.code(200).send({ received: true, error: error.message });
    }
  });

  /**
   * GET /api/payment/token-info
   * Obtiene el token generado para un pago específico
   */
  fastify.get("/api/payment/token-info", async (req, reply) => {
    const payment_id = req.query.payment_id;
    const payment_ref = req.query.payment_ref;
    const ref = payment_ref || payment_id;

    fastify.log.info({ payment_id, payment_ref }, "Token info requested");

    if (!ref) {
      return reply.code(400).send({ error: "Missing payment_id or payment_ref" });
    }

    try {
      try {
        await fastify.mysql.query(`SELECT 1 FROM unlock_tokens LIMIT 1`);
      } catch (tableError) {
        if (tableError.code === "ER_NO_SUCH_TABLE") {
          fastify.log.error("unlock_tokens table doesn't exist. Run migration 002!");
          return reply.code(500).send({
            error: "Database not initialized",
            message: "Por favor contacta a soporte. (DB table missing)",
          });
        }
        throw tableError;
      }

      const [rows] = await fastify.mysql.query(
        `SELECT token, portal_id, expires_at, created_at 
         FROM unlock_tokens 
         WHERE payment_reference = ? 
         LIMIT 1`,
        [ref]
      );

      fastify.log.info({ ref, found: rows.length > 0 }, "Token search result");

      if (rows.length === 0) {
        return reply.code(404).send({
          error: "Token not found",
          message: "El token aún no ha sido generado. Espera unos segundos y recarga.",
          debug: { ref },
        });
      }

      const tokenData = rows[0];

      let email = "";
      if (payment_ref && String(payment_ref).startsWith("paypal-")) {
        email = "";
      } else if (paymentClient && payment_id) {
        try {
          const payment = await paymentClient.get({ id: payment_id });
          email = payment.metadata?.email || payment.payer?.email || "";
          fastify.log.info({ payment_id, email }, "Payment email retrieved");
        } catch (mpError) {
          fastify.log.warn({ err: mpError, payment_id }, "Could not get payment from MercadoPago");
        }
      }

      return reply.send({
        token: tokenData.token,
        email: email,
        portalId: tokenData.portal_id,
        expiresAt: tokenData.expires_at,
      });
    } catch (error) {
      fastify.log.error(
        {
          err: error,
          ref,
          message: error.message,
          code: error.code,
          stack: error.stack,
        },
        "Error getting token info"
      );
      
      return reply.code(500).send({
        error: "Failed to get token",
        message: error.message,
        code: error.code
      });
    }
  });

  /**
   * GET /payment
   * Sirve la página de checkout
   */
  fastify.get("/payment", async (req, reply) => {
    return reply.sendFile('payment-checkout.html');
  });

  /**
   * GET /payment/success
   * Sirve la página de éxito
   */
  fastify.get("/payment/success", async (req, reply) => {
    return reply.sendFile('payment-success.html');
  });

  /**
   * GET /payment/failure
   * Sirve la página de error
   */
  fastify.get("/payment/failure", async (req, reply) => {
    return reply.type('text/html').send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
          <meta charset="UTF-8">
          <title>Pago Cancelado</title>
          <style>
              body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
                  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                  min-height: 100vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  padding: 20px;
              }
              .container {
                  background: white;
                  padding: 40px;
                  border-radius: 16px;
                  text-align: center;
                  max-width: 500px;
              }
              h1 { color: #ef4444; }
              .btn {
                  display: inline-block;
                  background: #0091AE;
                  color: white;
                  padding: 12px 24px;
                  border-radius: 8px;
                  text-decoration: none;
                  margin-top: 20px;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div style="font-size: 60px;">❌</div>
              <h1>Pago Cancelado</h1>
              <p>No se completó el pago. Puedes intentar nuevamente cuando quieras.</p>
              <a href="/payment" class="btn">Reintentar Pago</a>
          </div>
      </body>
      </html>
    `);
  });

  /**
   * GET /api/payment/debug
   * Endpoint de diagnóstico
   */
  fastify.get("/api/payment/debug", async (req, reply) => {
    try {
      // Verificar tabla con más detalle
      let tableExists = false;
      let tableError = null;
      let tablesList = [];
      
      try {
        // Primero, listar todas las tablas
        const [allTables] = await fastify.mysql.query(`SHOW TABLES`);
        tablesList = allTables.map(t => Object.values(t)[0]);
        
        // Verificar si existe unlock_tokens
        await fastify.mysql.query(`SELECT 1 FROM unlock_tokens LIMIT 1`);
        tableExists = true;
      } catch (e) {
        tableExists = false;
        tableError = {
          message: e.message,
          code: e.code,
          sqlMessage: e.sqlMessage
        };
      }

      // Contar tokens
      let tokenCount = 0;
      let tokens = [];
      if (tableExists) {
        try {
          const [rows] = await fastify.mysql.query(
            `SELECT portal_id, token, payment_reference, status, created_at, expires_at 
             FROM unlock_tokens 
             ORDER BY created_at DESC 
             LIMIT 5`
          );
          tokenCount = rows.length;
          tokens = rows;
        } catch (e) {
          fastify.log.error({ err: e }, "Error fetching tokens");
        }
      }

      let mercadoPagoConfigured = !!process.env.MERCADOPAGO_ACCESS_TOKEN;
      let paypalConfigured = isPayPalConfigured();

      const deploymentInfo = {
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
      };

      return reply.send({
        status: "OK",
        deployment: deploymentInfo,
        database: {
          tableExists,
          tokenCount,
          recentTokens: tokens,
          allTables: tablesList,
          error: tableError,
        },
        mercadoPago: {
          configured: mercadoPagoConfigured,
          accessToken: mercadoPagoConfigured ? "configured" : "missing",
        },
        paypal: {
          configured: paypalConfigured,
        },
        unlock: {
          priceUsd: getUnlockPriceUsd(),
          durationDays: getUnlockDurationDays(),
        },
        environment: {
          baseUrl: process.env.BASE_URL || "not set",
          nodeEnv: process.env.NODE_ENV || "not set",
        },
      });
    } catch (error) {
      fastify.log.error({ err: error }, "Error in debug endpoint");
      return reply.code(500).send({
        error: error.message,
        code: error.code,
        stack: error.stack
      });
    }
  });

  /**
   * GET /payment/pending
   * Sirve la página de pago pendiente
   */
  fastify.get("/payment/pending", async (req, reply) => {
    return reply.type('text/html').send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
          <meta charset="UTF-8">
          <title>Pago Pendiente</title>
          <style>
              body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
                  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                  min-height: 100vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  padding: 20px;
              }
              .container {
                  background: white;
                  padding: 40px;
                  border-radius: 16px;
                  text-align: center;
                  max-width: 500px;
              }
              h1 { color: #f59e0b; }
              .btn {
                  display: inline-block;
                  background: #0091AE;
                  color: white;
                  padding: 12px 24px;
                  border-radius: 8px;
                  text-decoration: none;
                  margin-top: 20px;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div style="font-size: 60px;">⏳</div>
              <h1>Pago Pendiente</h1>
              <p>Tu pago está siendo procesado. Te enviaremos un email cuando se confirme.</p>
              <a href="https://app.hubspot.com" class="btn">Ir a HubSpot</a>
          </div>
      </body>
      </html>
    `);
  });
}

