// src/services/history/history.service.js

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
    warningInsights
  } = data;

  const db = server.db;

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
        warning_insights
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        warningInsights
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
