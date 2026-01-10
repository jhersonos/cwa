/**
 * TOKEN VALIDATION SERVICE
 * Maneja validación de tokens de desbloqueo de auditoría completa
 */

/**
 * Valida un token de desbloqueo para un portal específico
 */
export async function validateUnlockToken(fastify, portalId, token) {
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
      [portalId, token]
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
 */
export async function checkUnlockStatus(fastify, portalId) {
  try {
    const [rows] = await fastify.mysql.query(
      `SELECT 
        id, 
        token, 
        expires_at 
      FROM unlock_tokens 
      WHERE portal_id = ? 
        AND status = 'active' 
        AND expires_at > NOW()
      LIMIT 1`,
      [portalId]
    );

    if (rows.length === 0) {
      return {
        unlocked: false,
        expiresAt: null
      };
    }

    return {
      unlocked: true,
      expiresAt: rows[0].expires_at
    };
  } catch (error) {
    fastify.log.error({ err: error, portalId }, "Error checking unlock status");
    return {
      unlocked: false,
      expiresAt: null
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

