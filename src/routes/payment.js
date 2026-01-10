// src/routes/payment.js
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import crypto from 'crypto';

export default async function paymentRoutes(fastify) {
  // Inicializar MercadoPago
  const client = new MercadoPagoConfig({ 
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN 
  });
  
  const preferenceClient = new Preference(client);
  const paymentClient = new Payment(client);

  /**
   * POST /api/payment/create-preference
   * Crea una preferencia de pago en MercadoPago
   */
  fastify.post("/api/payment/create-preference", async (req, reply) => {
    const { portalId, email } = req.body;

    if (!portalId || !email) {
      return reply.code(400).send({
        error: "Missing required fields",
        message: "Se requiere portalId y email"
      });
    }

    try {
      // Crear preferencia de pago
      const preference = await preferenceClient.create({
        body: {
          items: [
            {
              id: 'cwa-unlock-30d',
              title: 'Auditoría Completa - Cost CRM Risk Scanner',
              description: 'Desbloqueo de auditoría completa por 30 días con exportaciones CSV',
              category_id: 'services',
              quantity: 1,
              currency_id: 'USD',
              unit_price: 9.99
            }
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

      fastify.log.info({ portalId, preferenceId: preference.id }, "Payment preference created");

      return reply.send({
        id: preference.id,
        init_point: preference.init_point,
        sandbox_init_point: preference.sandbox_init_point
      });

    } catch (error) {
      fastify.log.error({ err: error, portalId }, "Error creating payment preference");
      return reply.code(500).send({
        error: "Preference creation failed",
        message: error.message
      });
    }
  });

  /**
   * POST /api/payment/webhook
   * Webhook para notificaciones de MercadoPago
   */
  fastify.post("/api/payment/webhook", async (req, reply) => {
    try {
      const { type, data } = req.body;

      fastify.log.info({ type, data }, "Received payment webhook");

      // Solo procesar pagos aprobados
      if (type === 'payment') {
        const paymentId = data.id;

        // Obtener info completa del pago
        const payment = await paymentClient.get({ id: paymentId });

        fastify.log.info({ paymentId, status: payment.status }, "Payment info retrieved");

        if (payment.status === 'approved') {
          const portalId = payment.metadata.portal_id;
          const email = payment.metadata.email || payment.payer.email;

          // Generar token único
          const token = crypto.randomBytes(16).toString('hex');

          // Calcular fecha de expiración (30 días)
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);

          // Guardar en base de datos
          await fastify.mysql.query(
            `INSERT INTO unlock_tokens (portal_id, token, expires_at, payment_reference) 
             VALUES (?, ?, ?, ?)`,
            [portalId, token, expiresAt, paymentId.toString()]
          );

          fastify.log.info({ portalId, token, paymentId }, "Unlock token created from payment");

          // TODO: Enviar email con token (implementar después)
          // await sendTokenEmail(email, token, portalId);
        }
      }

      return reply.code(200).send({ received: true });

    } catch (error) {
      fastify.log.error({ err: error }, "Error processing webhook");
      // Siempre responder 200 a webhooks para no reintentarlos
      return reply.code(200).send({ received: true, error: error.message });
    }
  });

  /**
   * GET /api/payment/token-info
   * Obtiene el token generado para un pago específico
   */
  fastify.get("/api/payment/token-info", async (req, reply) => {
    const { payment_id } = req.query;

    if (!payment_id) {
      return reply.code(400).send({ error: "Missing payment_id" });
    }

    try {
      // Buscar token por payment_id
      const [rows] = await fastify.mysql.query(
        `SELECT token, portal_id, expires_at, created_at 
         FROM unlock_tokens 
         WHERE payment_reference = ? 
         LIMIT 1`,
        [payment_id]
      );

      if (rows.length === 0) {
        return reply.code(404).send({
          error: "Token not found",
          message: "El token aún no ha sido generado. Espera unos segundos y recarga."
        });
      }

      const tokenData = rows[0];

      // Obtener email del pago
      const payment = await paymentClient.get({ id: payment_id });
      const email = payment.metadata?.email || payment.payer?.email || '';

      return reply.send({
        token: tokenData.token,
        email: email,
        portalId: tokenData.portal_id,
        expiresAt: tokenData.expires_at
      });

    } catch (error) {
      fastify.log.error({ err: error, payment_id }, "Error getting token info");
      return reply.code(500).send({
        error: "Failed to get token",
        message: error.message
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

