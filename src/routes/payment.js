// src/routes/payment.js
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import {
  createUnlockTokenAfterPayment,
  getMercadoPagoCurrencyId,
  getMercadoPagoUnitPrice,
  getUnlockDurationDays,
  getUnlockPriceUsd,
} from "../services/payment/unlockFromPayment.service.js";
import {
  createPayPalOrder,
  capturePayPalOrder,
  isPayPalConfigured,
} from "../services/payment/paypal.service.js";

/** Credenciales de prueba MP suelen usar token TEST-…; el checkout debe usar sandbox_init_point, no init_point. */
function isMercadoPagoSandboxToken(token) {
  return typeof token === "string" && token.startsWith("TEST-");
}

/**
 * auto: TEST- → sandbox; sandbox|production fuerza la URL del checkout.
 */
function resolveMercadoPagoCheckoutUrl(preference, mpToken) {
  const mode = (process.env.MERCADOPAGO_CHECKOUT_MODE || "auto").toLowerCase();
  const sandboxUrl = preference.sandbox_init_point;
  const prodUrl = preference.init_point;
  if (mode === "sandbox") return sandboxUrl || prodUrl;
  if (mode === "production") return prodUrl || sandboxUrl;
  const isTest = isMercadoPagoSandboxToken(mpToken);
  return isTest ? sandboxUrl || prodUrl : prodUrl || sandboxUrl;
}

/** Extrae ID de pago de distintos formatos de webhook / notificación MP. */
function extractMercadoPagoPaymentId(body) {
  if (!body || typeof body !== "object") return null;
  const idFromData = body.data?.id ?? body.data?.resource_id;
  if (idFromData != null && String(idFromData).trim() !== "") {
    return String(idFromData);
  }
  if (body.type === "payment" && body.id != null) return String(body.id);
  const resource = body.resource;
  if (typeof resource === "string" && resource.includes("/")) {
    const m = resource.match(/(\d+)\s*$/);
    if (m) return m[1];
  }
  return null;
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
      /** Monto y moneda usados en la preferencia MP (pueden diferir de USD). */
      checkoutPrice: getMercadoPagoUnitPrice(),
      checkoutCurrency: getMercadoPagoCurrencyId(),
      durationDays: getUnlockDurationDays(),
      currency: "USD",
      mercadoPagoEnabled: !!mpToken,
      mercadoPagoSandbox: isMercadoPagoSandboxToken(mpToken),
      mercadoPagoCheckoutMode: process.env.MERCADOPAGO_CHECKOUT_MODE || "auto",
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

    const unitPrice = getMercadoPagoUnitPrice();
    const currencyId = getMercadoPagoCurrencyId();
    const baseUrl = (process.env.BASE_URL || "https://cwa.estado7.com").replace(/\/$/, "");

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
              currency_id: currencyId,
              unit_price: unitPrice,
            },
          ],
          payer: {
            email: email,
          },
          metadata: {
            portal_id: portalId,
            email: email,
          },
          back_urls: {
            success: `${baseUrl}/payment/success`,
            failure: `${baseUrl}/payment/failure`,
            pending: `${baseUrl}/payment/pending`,
          },
          auto_return: "approved",
          binary_mode: true,
          notification_url: `${baseUrl}/api/payment/webhook`,
          statement_descriptor: "CWA AUDIT",
          external_reference: `CWA-${portalId}-${Date.now()}`,
        },
      });

      const checkoutUrl = resolveMercadoPagoCheckoutUrl(preference, mpToken);
      let checkoutHost = "";
      try {
        checkoutHost = checkoutUrl ? new URL(checkoutUrl).hostname : "";
      } catch (_) {}

      fastify.log.info(
        {
          portalId,
          preferenceId: preference.id,
          currencyId,
          unitPrice,
          checkoutHost,
          checkoutMode: process.env.MERCADOPAGO_CHECKOUT_MODE || "auto",
          hasCheckoutUrl: !!checkoutUrl,
        },
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
   * GET /api/payment/webhook
   * Algunos health-checks o integraciones hacen GET; evita 404 en logs.
   */
  fastify.get("/api/payment/webhook", async (_req, reply) => {
    return reply.code(200).send({ ok: true, hint: "Las notificaciones MP son POST" });
  });

  /**
   * POST /api/payment/webhook
   * Webhook para notificaciones de MercadoPago
   */
  fastify.post("/api/payment/webhook", async (req, reply) => {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch (_) {
          body = {};
        }
      }

      const type = body?.type ?? body?.topic;
      const paymentId = extractMercadoPagoPaymentId(body);

      fastify.log.info(
        {
          type,
          paymentIdFromWebhook: paymentId,
          action: body?.action,
          liveMode: body?.live_mode,
          rawKeys: body && typeof body === "object" ? Object.keys(body) : [],
        },
        "Received payment webhook"
      );

      const isPayment = type === "payment" || body?.topic === "payment";

      if (isPayment && paymentClient && paymentId) {
        let payment;
        try {
          payment = await paymentClient.get({ id: paymentId });
        } catch (getErr) {
          fastify.log.error(
            {
              err: getErr,
              paymentId,
              status: getErr?.statusCode ?? getErr?.cause?.status,
              message: getErr?.message,
            },
            "MP webhook: no se pudo obtener el pago (¿404 id inválido o token incorrecto?)"
          );
          return reply.code(200).send({ received: true, skipped: "payment_get_failed" });
        }

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
      } else if (isPayment && !paymentId) {
        fastify.log.warn({ body: JSON.stringify(body).slice(0, 500) }, "MP webhook: tipo payment sin id extraíble");
      }

      return reply.code(200).send({ received: true });
    } catch (error) {
      fastify.log.error(
        {
          err: error,
          message: error.message,
          stack: error.stack,
        },
        "❌ Error processing webhook"
      );
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
          tokenPrefix: mercadoPagoConfigured
            ? String(process.env.MERCADOPAGO_ACCESS_TOKEN).slice(0, 5) + "…"
            : null,
          sandboxDetected: isMercadoPagoSandboxToken(process.env.MERCADOPAGO_ACCESS_TOKEN),
          checkoutMode: process.env.MERCADOPAGO_CHECKOUT_MODE || "auto",
          currencyId: getMercadoPagoCurrencyId(),
          unitPrice: getMercadoPagoUnitPrice(),
          hints: [
            "Si el checkout MP muestra error genérico: prueba MERCADOPAGO_CURRENCY_ID=ARS y MERCADOPAGO_UNIT_PRICE acorde (cuentas LATAM a veces no aceptan USD en pruebas).",
            "Fuerza URL sandbox: MERCADOPAGO_CHECKOUT_MODE=sandbox",
          ],
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

