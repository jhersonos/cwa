/**
 * TOKEN VALIDATION SERVICE
 * Maneja validación de tokens de desbloqueo de auditoría completa
 */

/** Misma forma que OAuth / HubSpot context.portal.id */
export function normalizePortalId(portalId) {
  return String(portalId ?? "").trim();
}

/**
 * Resuelve el portal_id canónico guardado en `portals` (evita mismatch string/number).
 */
async function resolveCanonicalPortalId(fastify, portalId) {
  const pid = normalizePortalId(portalId);
  if (!pid) return pid;

  try {
    const [rows] = await fastify.mysql.query(
      `SELECT portal_id FROM portals
       WHERE portal_id = ?
          OR CAST(portal_id AS CHAR) = ?
       LIMIT 1`,
      [pid, pid]
    );
    if (rows.length > 0) {
      return String(rows[0].portal_id);
    }
  } catch (err) {
    fastify.log.warn({ err: err.message, portalId: pid }, "resolveCanonicalPortalId failed");
  }
  return pid;
}

/**
 * Valida un token de desbloqueo para un portal específico
 */
export async function validateUnlockToken(fastify, portalId, token) {
  const canonicalId = await resolveCanonicalPortalId(fastify, portalId);
  try {
    const [rows] = await fastify.mysql.query(
      `SELECT 
        id, 
        portal_id, 
        token, 
        status, 
        created_at, 
        expires_at 
      FROM unlock_tokens 
      WHERE portal_id = ? 
        AND token = ? 
        AND status = 'active' 
        AND expires_at > NOW()
      LIMIT 1`,
      [canonicalId, token]
    );

    if (rows.length === 0) {
      return {
        valid: false,
        message: "Token inválido, expirado o no corresponde a esta cuenta"
      };
    }

    const tokenData = rows[0];

    return {
      valid: true,
      tokenData: {
        id: tokenData.id,
        portalId: tokenData.portal_id,
        expiresAt: tokenData.expires_at,
        createdAt: tokenData.created_at
      },
      message: "Token válido"
    };
  } catch (error) {
    fastify.log.error({ err: error, portalId }, "Error validating unlock token");
    throw error;
  }
}

/**
 * Verifica si un portal tiene acceso desbloqueado activo
 * Resiliente: no bloquea si la tabla no existe o hay errores
 */
export async function checkUnlockStatus(fastify, portalId) {
  const requestedId = normalizePortalId(portalId);
  try {
    const [tables] = await fastify.mysql.query(
      `SHOW TABLES LIKE 'unlock_tokens'`
    );

    if (tables.length === 0) {
      fastify.log.warn({ portalId: requestedId }, "unlock_tokens table does not exist yet");
      return {
        unlocked: false,
        expiresAt: null,
        token: null,
        portalId: requestedId
      };
    }

    const canonicalId = await resolveCanonicalPortalId(fastify, requestedId);

    const [rows] = await fastify.mysql.query(
      `SELECT id, token, expires_at
       FROM unlock_tokens
       WHERE portal_id = ?
         AND status = 'active'
         AND expires_at > UTC_TIMESTAMP()
       ORDER BY expires_at DESC
       LIMIT 1`,
      [canonicalId]
    );

    if (rows.length === 0) {
      fastify.log.info(
        { portalId: requestedId, canonicalId },
        "Unlock status: no active token"
      );
      return {
        unlocked: false,
        expiresAt: null,
        token: null,
        portalId: canonicalId
      };
    }

    const expiresAt = rows[0].expires_at;
    const expiresIso =
      expiresAt instanceof Date
        ? expiresAt.toISOString()
        : expiresAt
          ? new Date(expiresAt).toISOString()
          : null;

    fastify.log.info(
      { portalId: requestedId, canonicalId, expiresAt: expiresIso },
      "Unlock status: active"
    );

    return {
      unlocked: true,
      expiresAt: expiresIso,
      token: rows[0].token,
      portalId: canonicalId
    };
  } catch (error) {
    fastify.log.warn(
      { err: error, portalId: requestedId },
      "Error checking unlock status (non-blocking)"
    );
    return {
      unlocked: false,
      expiresAt: null,
      token: null,
      portalId: requestedId
    };
  }
}

/**
 * Registra una descarga de auditoría
 */
export async function logDownload(fastify, portalId, token, downloadType, reportType) {
  try {
    await fastify.mysql.query(
      `INSERT INTO unlock_downloads (portal_id, token, download_type, report_type) 
       VALUES (?, ?, ?, ?)`,
      [portalId, token, downloadType, reportType]
    );
  } catch (error) {
    fastify.log.warn({ err: error, portalId }, "Failed to log download");
    // No bloqueante
  }
}

/**
 * Crea un nuevo token (usado por el sistema de pago)
 */
export async function createUnlockToken(fastify, portalId, token, expiresAt, paymentReference) {
  try {
    await fastify.mysql.query(
      `INSERT INTO unlock_tokens (portal_id, token, expires_at, payment_reference) 
       VALUES (?, ?, ?, ?)`,
      [portalId, token, expiresAt, paymentReference]
    );

    return {
      success: true,
      message: "Token creado exitosamente"
    };
  } catch (error) {
    fastify.log.error({ err: error, portalId }, "Error creating unlock token");
    throw error;
  }
}

