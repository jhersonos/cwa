/**
 * PayPal Orders API v2 (checkout + capture)
 * Requiere: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE=sandbox|live
 */

const BASE_SANDBOX = "https://api-m.sandbox.paypal.com";
const BASE_LIVE = "https://api-m.paypal.com";

function getBaseUrl() {
  return process.env.PAYPAL_MODE === "live" ? BASE_LIVE : BASE_SANDBOX;
}

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry - 60_000) {
    return cachedToken;
  }

  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("PayPal no configurado (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)");
  }

  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${getBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PayPal OAuth failed: ${res.status} ${t}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = now + (data.expires_in || 32400) * 1000;
  return cachedToken;
}

/**
 * Crea orden de captura y devuelve approval link + order id
 */
export async function createPayPalOrder({ amountUsd, portalId, email, returnUrl, cancelUrl }) {
  const accessToken = await getAccessToken();
  const value = Number(amountUsd).toFixed(2);
  const customId = JSON.stringify({
    p: String(portalId),
    e: String(email || ""),
  });

  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: "USD",
          value,
        },
        description: "Auditoría completa CWA — 1 mes",
        custom_id: customId.slice(0, 127),
      },
    ],
    application_context: {
      brand_name: "Cost CRM Risk Scanner",
      landing_page: "NO_PREFERENCE",
      user_action: "PAY_NOW",
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  };

  const res = await fetch(`${getBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PayPal create order: ${res.status} ${t}`);
  }

  const order = await res.json();
  const approve = order.links?.find((l) => l.rel === "approve");
  if (!approve?.href) {
    throw new Error("PayPal: no approval link in response");
  }

  return { orderId: order.id, approvalUrl: approve.href };
}

/**
 * Captura pago de una orden aprobada (token en return URL = order id)
 */
export async function capturePayPalOrder(orderId) {
  const accessToken = await getAccessToken();
  const res = await fetch(`${getBaseUrl()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PayPal capture: ${res.status} ${t}`);
  }

  return res.json();
}

export function isPayPalConfigured() {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}
