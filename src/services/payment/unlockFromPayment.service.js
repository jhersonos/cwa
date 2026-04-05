/**
 * Creación de token de desbloqueo tras pago (Mercado Pago, PayPal, etc.)
 */
import crypto from "crypto";

/** Días de acceso tras pago (1 mes ≈ 30 días) */
export function getUnlockDurationDays() {
  const n = parseInt(process.env.UNLOCK_DURATION_DAYS || "30", 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/** Precio en USD para checkout */
export function getUnlockPriceUsd() {
  const n = parseFloat(process.env.UNLOCK_PRICE_USD || "5", 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/**
 * Moneda de la preferencia Mercado Pago (USD, ARS, MXN, …).
 * Si tu cuenta/sandbox no acepta USD, prueba ARS + MERCADOPAGO_UNIT_PRICE.
 */
export function getMercadoPagoCurrencyId() {
  const c = (process.env.MERCADOPAGO_CURRENCY_ID || "USD").trim().toUpperCase();
  return c || "USD";
}

/**
 * Monto unitario en la moneda de MP. Por defecto = UNLOCK_PRICE_USD.
 * Si MERCADOPAGO_CURRENCY_ID no es USD, define MERCADOPAGO_UNIT_PRICE (ej. 5000 para ARS).
 */
export function getMercadoPagoUnitPrice() {
  const raw = process.env.MERCADOPAGO_UNIT_PRICE;
  if (raw != null && String(raw).trim() !== "") {
    const n = parseFloat(String(raw).trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return getUnlockPriceUsd();
}

/**
 * Inserta token único si no existe payment_reference (idempotente).
 * @returns {{ created: boolean, token?: string, expiresAt?: Date, portalId?: string }}
 */
export async function createUnlockTokenAfterPayment(fastify, { portalId, paymentReference, email }) {
  if (!portalId || !paymentReference) {
    throw new Error("portalId y paymentReference son obligatorios");
  }

  const [existing] = await fastify.mysql.query(
    `SELECT token, expires_at FROM unlock_tokens WHERE payment_reference = ? LIMIT 1`,
    [paymentReference]
  );

  if (existing.length > 0) {
    return {
      created: false,
      token: existing[0].token,
      expiresAt: existing[0].expires_at,
      portalId,
    };
  }

  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + getUnlockDurationDays());

  await fastify.mysql.query(
    `INSERT INTO unlock_tokens (portal_id, token, expires_at, payment_reference, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [portalId, token, expiresAt, paymentReference]
  );

  fastify.log.info({ portalId, paymentReference, email }, "Unlock token creado tras pago");

  return {
    created: true,
    token,
    expiresAt,
    portalId,
  };
}
