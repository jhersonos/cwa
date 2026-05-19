import crypto from "crypto";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 h

function getSecret() {
  return process.env.CWA_ADMIN_SECRET || "";
}

function getExpectedEmail() {
  return (
    process.env.CWA_ADMIN_EMAIL ||
    process.env.ADMIN_EMAIL ||
    "admin@cwa.estado7.com"
  );
}

function getExpectedPassword() {
  return (
    process.env.CWA_ADMIN_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    process.env.CWA_ADMIN_SECRET ||
    ""
  );
}

export function verifyAdminCredentials(email, password) {
  const secret = getSecret();
  if (!secret) {
    return { ok: false, error: "CWA_ADMIN_SECRET no configurado en el servidor" };
  }
  const expectedEmail = getExpectedEmail().trim().toLowerCase();
  const expectedPassword = getExpectedPassword();
  if (!expectedPassword) {
    return { ok: false, error: "Contraseña de admin no configurada" };
  }
  if ((email || "").trim().toLowerCase() !== expectedEmail) {
    return { ok: false, error: "Credenciales inválidas" };
  }
  if (password !== expectedPassword) {
    return { ok: false, error: "Credenciales inválidas" };
  }
  return { ok: true };
}

export function issueAdminToken(email) {
  const secret = getSecret();
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = JSON.stringify({
    email: email.trim().toLowerCase(),
    exp
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");
  return {
    token: `${payloadB64}.${sig}`,
    expiresAt: new Date(exp).toISOString()
  };
}

export function verifyAdminToken(token) {
  const secret = getSecret();
  if (!secret || !token) {
    return { valid: false, email: null };
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, email: null };
  }
  const [payloadB64, sig] = parts;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");
  if (sig !== expected) {
    return { valid: false, email: null };
  }
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (!payload.exp || Date.now() > payload.exp) {
      return { valid: false, email: null };
    }
    if ((payload.email || "").toLowerCase() !== getExpectedEmail().toLowerCase()) {
      return { valid: false, email: null };
    }
    return { valid: true, email: payload.email };
  } catch {
    return { valid: false, email: null };
  }
}

export function extractBearerToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}
