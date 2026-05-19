import axios from "axios";
import crypto from "crypto";

/**
 * Columnas opcionales en `portals`; si la migración 004 no corrió, las updates fallan en silencio parcial.
 */
async function columnExists(fastify, table, column) {
  try {
    const [rows] = await fastify.mysql.query(
      `SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?`,
      [table, column]
    );
    return Number(rows[0]?.c) > 0;
  } catch {
    return false;
  }
}

export async function enrichPortalFromHubSpot(fastify, portalId, accessToken) {
  const hasMeta = await columnExists(fastify, "portals", "hub_domain");
  if (!hasMeta) return;

  let hubDomain = null;
  let installerEmail = null;
  let accountName = null;

  try {
    const tokenInfoRes = await axios.get(
      `https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`,
      { timeout: 8000 }
    );
    hubDomain = tokenInfoRes.data?.hub_domain || null;
    installerEmail = tokenInfoRes.data?.user || null;
  } catch (err) {
    fastify.log.warn({ err: err.message, portalId }, "HubSpot access-token info failed");
  }

  try {
    const accountRes = await axios.get(
      "https://api.hubapi.com/account-info/v3/details",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 8000
      }
    );
    accountName =
      accountRes.data?.companyName ||
      accountRes.data?.portalId?.toString() ||
      null;
  } catch (err) {
    fastify.log.warn({ err: err.message, portalId }, "HubSpot account-info failed");
  }

  const sets = [];
  const params = [];
  if (hubDomain) {
    sets.push("hub_domain = COALESCE(?, hub_domain)");
    params.push(hubDomain);
  }
  if (accountName) {
    sets.push("account_name = COALESCE(?, account_name)");
    params.push(accountName);
  }
  if (installerEmail) {
    sets.push(
      "installer_email = COALESCE(?, installer_email)",
      "last_user_email = COALESCE(?, last_user_email)"
    );
    params.push(installerEmail, installerEmail);
  }
  sets.push("last_seen_at = NOW()");
  if (await columnExists(fastify, "portals", "installed_at")) {
    sets.push("installed_at = COALESCE(installed_at, NOW())");
  }

  if (sets.length === 0) return;

  params.push(String(portalId));
  await fastify.mysql.query(
    `UPDATE portals SET ${sets.join(", ")} WHERE portal_id = ?`,
    params
  );
}

/**
 * Registra email/nombre del usuario que abre la app (marketplace).
 */
export async function trackPortalUsage(
  fastify,
  { portalId, email, firstName, lastName, source = "app" }
) {
  const pid = String(portalId || "").trim();
  const userEmail = (email || "").trim().toLowerCase();
  if (!pid || !userEmail) {
    return { ok: false, message: "portalId y email requeridos" };
  }

  const [existing] = await fastify.mysql.query(
    "SELECT portal_id FROM portals WHERE portal_id = ? LIMIT 1",
    [pid]
  );
  if (!existing.length) {
    return { ok: false, message: "Portal no conectado (OAuth pendiente)" };
  }

  const hasMeta = await columnExists(fastify, "portals", "last_user_email");
  if (!hasMeta) {
    return { ok: true, message: "Migración 004 pendiente; portal existe" };
  }

  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || null;

  await fastify.mysql.query(
    `
    UPDATE portals SET
      last_user_email = ?,
      last_user_name = COALESCE(?, last_user_name),
      installer_email = COALESCE(installer_email, ?),
      last_seen_at = NOW(),
      installed_at = COALESCE(installed_at, NOW())
    WHERE portal_id = ?
    `,
    [userEmail, displayName, userEmail, pid]
  );

  fastify.log.info({ portalId: pid, userEmail, source }, "Portal usage tracked");
  return { ok: true, message: "Registrado" };
}

export async function getAdminDashboard(fastify) {
  const hasMeta = await columnExists(fastify, "portals", "last_seen_at");
  const hasUnlock = await tableExists(fastify, "unlock_tokens");
  const hasHistory = await tableExists(fastify, "scan_history");

  const [countRows] = await fastify.mysql.query(
    "SELECT COUNT(*) AS total FROM portals"
  );
  const totalPortals = Number(countRows[0]?.total || 0);

  let proActive = 0;
  if (hasUnlock) {
    const [proRows] = await fastify.mysql.query(
      `SELECT COUNT(DISTINCT portal_id) AS c
       FROM unlock_tokens
       WHERE status = 'active' AND expires_at > NOW()`
    );
    proActive = Number(proRows[0]?.c || 0);
  }

  let scansLast7d = 0;
  if (hasHistory) {
    const [scanRows] = await fastify.mysql.query(
      `SELECT COUNT(*) AS c FROM scan_history
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );
    scansLast7d = Number(scanRows[0]?.c || 0);
  }

  const metaSelect = hasMeta
    ? `p.hub_domain, p.account_name, p.installer_email, p.last_user_email,
       p.last_user_name, p.installed_at, p.last_seen_at, p.admin_notes,`
    : "";

  const unlockSelect = hasUnlock
    ? `(SELECT ut.expires_at FROM unlock_tokens ut
        WHERE ut.portal_id = p.portal_id AND ut.status = 'active' AND ut.expires_at > NOW()
        ORDER BY ut.expires_at DESC LIMIT 1) AS pro_expires_at,
       (SELECT ut.token FROM unlock_tokens ut
        WHERE ut.portal_id = p.portal_id AND ut.status = 'active' AND ut.expires_at > NOW()
        ORDER BY ut.expires_at DESC LIMIT 1) AS pro_token,`
    : `NULL AS pro_expires_at, NULL AS pro_token,`;

  const scanSelect = hasHistory
    ? `(SELECT COUNT(*) FROM scan_history sh WHERE sh.portal_id = p.portal_id) AS scan_count,
       (SELECT MAX(sh.created_at) FROM scan_history sh WHERE sh.portal_id = p.portal_id) AS last_scan_at,`
    : `0 AS scan_count, NULL AS last_scan_at,`;

  const [portals] = await fastify.mysql.query(
    `
    SELECT
      p.portal_id,
      ${metaSelect}
      p.expires_at AS token_expires_at,
      ${unlockSelect}
      ${scanSelect}
      p.access_token IS NOT NULL AS has_tokens
    FROM portals p
    ORDER BY COALESCE(p.last_seen_at, p.installed_at) DESC, p.portal_id DESC
  `
  );

  const list = portals.map((row) => ({
    portalId: String(row.portal_id),
    hubDomain: row.hub_domain || null,
    accountName: row.account_name || null,
    installerEmail: row.installer_email || null,
    lastUserEmail: row.last_user_email || null,
    lastUserName: row.last_user_name || null,
    installedAt: row.installed_at || null,
    lastSeenAt: row.last_seen_at || null,
    adminNotes: row.admin_notes || null,
    hasTokens: Boolean(row.has_tokens),
    proActive: Boolean(row.pro_expires_at),
    proExpiresAt: row.pro_expires_at || null,
    proTokenPreview: row.pro_token
      ? `${String(row.pro_token).slice(0, 8)}…`
      : null,
    scanCount: Number(row.scan_count || 0),
    lastScanAt: row.last_scan_at || null
  }));

  const activeLast30 = hasMeta
    ? list.filter((p) => {
        if (!p.lastSeenAt) return false;
        const t = new Date(p.lastSeenAt).getTime();
        return t > Date.now() - 30 * 24 * 60 * 60 * 1000;
      }).length
    : null;

  return {
    stats: {
      totalPortals,
      proActive,
      freePortals: totalPortals - proActive,
      scansLast7d,
      activeLast30d: activeLast30,
      withEmail: list.filter(
        (p) => p.installerEmail || p.lastUserEmail
      ).length
    },
    portals: list
  };
}

async function tableExists(fastify, name) {
  const [rows] = await fastify.mysql.query(`SHOW TABLES LIKE ?`, [name]);
  return rows.length > 0;
}

export async function activateProForPortal(
  fastify,
  portalId,
  { days = 365, paymentReference = "ADMIN_MANUAL", email = null }
) {
  const pid = String(portalId);
  const [portals] = await fastify.mysql.query(
    "SELECT portal_id FROM portals WHERE portal_id = ? LIMIT 1",
    [pid]
  );
  if (!portals.length) {
    return { ok: false, message: "Portal no encontrado" };
  }

  const hasUnlock = await tableExists(fastify, "unlock_tokens");
  if (!hasUnlock) {
    return { ok: false, message: "Tabla unlock_tokens no existe (migración 002)" };
  }

  await fastify.mysql.query(
    `UPDATE unlock_tokens SET status = 'revoked'
     WHERE portal_id = ? AND status = 'active'`,
    [pid]
  );

  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Number(days) || 365);

  await fastify.mysql.query(
    `INSERT INTO unlock_tokens (portal_id, token, expires_at, payment_reference, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [pid, token, expiresAt, paymentReference]
  );

  if (email && (await columnExists(fastify, "portals", "installer_email"))) {
    await fastify.mysql.query(
      `UPDATE portals SET installer_email = COALESCE(installer_email, ?) WHERE portal_id = ?`,
      [email.trim().toLowerCase(), pid]
    );
  }

  fastify.log.info({ portalId: pid, days, paymentReference }, "Pro activated from admin");

  return {
    ok: true,
    token,
    expiresAt: expiresAt.toISOString(),
    message: "Pro activado"
  };
}

export async function revokeProForPortal(fastify, portalId) {
  const pid = String(portalId);
  const [result] = await fastify.mysql.query(
    `UPDATE unlock_tokens SET status = 'revoked'
     WHERE portal_id = ? AND status = 'active'`,
    [pid]
  );
  return {
    ok: true,
    revoked: result.affectedRows || 0,
    message:
      result.affectedRows > 0
        ? "Pro revocado"
        : "No había token activo"
  };
}

export async function updatePortalAdminNotes(fastify, portalId, { adminNotes, installerEmail }) {
  const hasMeta = await columnExists(fastify, "portals", "admin_notes");
  if (!hasMeta) {
    return { ok: false, message: "Migración 004 pendiente" };
  }
  const sets = [];
  const params = [];
  if (adminNotes !== undefined) {
    sets.push("admin_notes = ?");
    params.push(adminNotes);
  }
  if (installerEmail !== undefined) {
    sets.push("installer_email = ?");
    params.push((installerEmail || "").trim().toLowerCase() || null);
  }
  if (!sets.length) {
    return { ok: false, message: "Nada que actualizar" };
  }
  params.push(String(portalId));
  await fastify.mysql.query(
    `UPDATE portals SET ${sets.join(", ")} WHERE portal_id = ?`,
    params
  );
  return { ok: true };
}
