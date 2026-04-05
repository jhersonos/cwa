// src/services/history/history.service.js

/** Ventana mínima entre análisis gratuitos (cuentas sin auditoría desbloqueada): 7 días */
export const FREE_SCAN_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Última ejecución de scan guardada en historial (para cuota free).
 */
export async function getLastScanAt(server, portalId) {
  try {
    const [rows] = await server.db.query(
      `
      SELECT MAX(created_at) AS last_at
      FROM scan_history
      WHERE portal_id = ?
      `,
      [portalId]
    );
    const raw = rows[0]?.last_at;
    if (raw == null) return null;
    const d = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch (err) {
    server.log.warn({ err, portalId }, "getLastScanAt failed (non-blocking)");
    return null;
  }
}

/**
 * Cuota de análisis gratuito (1/semana) solo para cuentas FREE.
 * Plan Pro / auditoría desbloqueada (token activo): sin límite — isUnlocked === true → siempre allowed.
 * @returns {{ allowed: boolean, nextAllowedAt: string | null, lastScanAt: string | null }}
 */
export async function getFreeScanQuota(server, portalId, isUnlocked) {
  if (isUnlocked) {
    return { allowed: true, nextAllowedAt: null, lastScanAt: null };
  }
  const last = await getLastScanAt(server, portalId);
  if (!last) {
    return { allowed: true, nextAllowedAt: null, lastScanAt: null };
  }
  const next = new Date(last.getTime() + FREE_SCAN_COOLDOWN_MS);
  const allowed = Date.now() >= next.getTime();
  return {
    allowed,
    nextAllowedAt: allowed ? null : next.toISOString(),
    lastScanAt: last.toISOString()
  };
}

/**
 * Guarda o actualiza el snapshot diario del scan
 * - Máx 1 registro por portal por día
 */
export async function saveScanSnapshot(server, data) {
  const {
    portalId,
    efficiencyScore,
    efficiencyLevel,
    hasLimitedVisibility,
    contactsTotal,
    usersTotal,
    workflowsTotal = 0,
    criticalInsights,
    warningInsights,
    // Nuevas métricas (opcionales)
    dealsTotal = 0,
    dealsWithoutContact = 0,
    dealsWithoutOwner = 0,
    dealsWithoutPrice = 0,
    dealsInactive = 0,
    companiesTotal = 0,
    companiesWithoutDomain = 0,
    companiesWithoutOwner = 0,
    companiesInactive = 0,
    toolsInUse = 0,
    toolsTotal = 0,
    toolsUsagePercentage = 0,
    contactsScore = 100,
    dealsScore = 100,
    companiesScore = 100,
    usersScore = 100,
    /** Objeto respuesta scan-v3 completo (opcional); se persiste como JSON */
    resultPayload = null
  } = data;

  const db = server.db;
  const payloadJson =
    resultPayload != null && typeof resultPayload === "object"
      ? JSON.stringify(resultPayload)
      : null;

  try {
    /* -------------------------------------------------
       1️⃣ Verificar si ya existe snapshot hoy
    ------------------------------------------------- */
    const [rows] = await db.query(
      `
      SELECT id
      FROM scan_history
      WHERE portal_id = ?
        AND DATE(created_at) = CURDATE()
      LIMIT 1
      `,
      [portalId]
    );

    /* -------------------------------------------------
       2️⃣ UPDATE si existe
    ------------------------------------------------- */
    if (rows.length > 0) {
      await db.query(
        `
        UPDATE scan_history
        SET
          efficiency_score = ?,
          efficiency_level = ?,
          has_limited_visibility = ?,
          contacts_total = ?,
          users_total = ?,
          workflows_total = ?,
          critical_insights = ?,
          warning_insights = ?,
          deals_total = ?,
          deals_without_contact = ?,
          deals_without_owner = ?,
          deals_without_price = ?,
          deals_inactive = ?,
          companies_total = ?,
          companies_without_domain = ?,
          companies_without_owner = ?,
          companies_inactive = ?,
          tools_in_use = ?,
          tools_total = ?,
          tools_usage_percentage = ?,
          contacts_score = ?,
          deals_score = ?,
          companies_score = ?,
          users_score = ?,
          result_payload = ?,
          created_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [
          efficiencyScore,
          efficiencyLevel,
          hasLimitedVisibility ? 1 : 0,
          contactsTotal,
          usersTotal,
          workflowsTotal,
          criticalInsights,
          warningInsights,
          dealsTotal,
          dealsWithoutContact,
          dealsWithoutOwner,
          dealsWithoutPrice,
          dealsInactive,
          companiesTotal,
          companiesWithoutDomain,
          companiesWithoutOwner,
          companiesInactive,
          toolsInUse,
          toolsTotal,
          toolsUsagePercentage,
          contactsScore,
          dealsScore,
          companiesScore,
          usersScore,
          payloadJson,
          rows[0].id
        ]
      );

      server.log.info(
        { portalId },
        "Scan history updated for today"
      );
      return;
    }

    /* -------------------------------------------------
       3️⃣ INSERT si no existe
    ------------------------------------------------- */
    await db.query(
      `
      INSERT INTO scan_history (
        portal_id,
        efficiency_score,
        efficiency_level,
        has_limited_visibility,
        contacts_total,
        users_total,
        workflows_total,
        critical_insights,
        warning_insights,
        deals_total,
        deals_without_contact,
        deals_without_owner,
        deals_without_price,
        deals_inactive,
        companies_total,
        companies_without_domain,
        companies_without_owner,
        companies_inactive,
        tools_in_use,
        tools_total,
        tools_usage_percentage,
        contacts_score,
        deals_score,
        companies_score,
        users_score,
        result_payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        portalId,
        efficiencyScore,
        efficiencyLevel,
        hasLimitedVisibility ? 1 : 0,
        contactsTotal,
        usersTotal,
        workflowsTotal,
        criticalInsights,
        warningInsights,
        dealsTotal,
        dealsWithoutContact,
        dealsWithoutOwner,
        dealsWithoutPrice,
        dealsInactive,
        companiesTotal,
        companiesWithoutDomain,
        companiesWithoutOwner,
        companiesInactive,
        toolsInUse,
        toolsTotal,
        toolsUsagePercentage,
        contactsScore,
        dealsScore,
        companiesScore,
        usersScore,
        payloadJson
      ]
    );

    server.log.info(
      { portalId },
      "Scan history created for today"
    );
  } catch (err) {
    server.log.error(
      { err, portalId },
      "Failed saving scan history snapshot"
    );
  }
}

/**
 * Obtiene historial de scans para el portal
 * - Ordenado por fecha descendente
 * - Usado por el frontend
 */
export async function getScanHistory(server, portalId, limit = 10) {
  const db = server.db;

  try {
    const [rows] = await db.query(
      `
      SELECT
        efficiency_score,
        critical_insights,
        warning_insights,
        created_at
      FROM scan_history
      WHERE portal_id = ?
      ORDER BY created_at DESC
      LIMIT ?
      `,
      [portalId, limit]
    );

    return rows;
  } catch (err) {
    server.log.error(
      { err, portalId },
      "Failed fetching scan history"
    );
    return [];
  }
}

/**
 * Último análisis completo guardado (para rehidratación tras recarga; no consume cuota).
 * @returns {Promise<{ payload: object, scannedAt: string } | null>}
 */
export async function getLastScanResult(server, portalId) {
  try {
    const [rows] = await server.db.query(
      `
      SELECT result_payload, created_at
      FROM scan_history
      WHERE portal_id = ?
        AND result_payload IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [portalId]
    );
    if (!rows?.length) return null;
    const raw = rows[0].result_payload;
    if (raw == null) return null;
    let payload;
    if (typeof raw === "string") {
      payload = JSON.parse(raw);
    } else if (typeof raw === "object") {
      payload = raw;
    } else {
      return null;
    }
    const scannedAt =
      rows[0].created_at instanceof Date
        ? rows[0].created_at.toISOString()
        : String(rows[0].created_at);
    return { payload, scannedAt };
  } catch (err) {
    server.log.warn({ err, portalId }, "getLastScanResult failed");
    return null;
  }
}
