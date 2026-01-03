// src/services/history/history.service.js

export async function saveScanSnapshot(fastify, snapshot) {
    const sql = `
      INSERT INTO scan_history (
        portal_id,
        scan_version,
        efficiency_score,
        efficiency_level,
        has_limited_visibility,
        contacts_total,
        users_total,
        workflows_total,
        critical_insights,
        warning_insights
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
  
    const values = [
      snapshot.portalId,
      "v3",
      snapshot.efficiencyScore,
      snapshot.efficiencyLevel,
      snapshot.hasLimitedVisibility,
      snapshot.contactsTotal,
      snapshot.usersTotal,
      snapshot.workflowsTotal,
      snapshot.criticalInsights,
      snapshot.warningInsights
    ];
  
    await fastify.db.execute(sql, values);
  }
  
  export async function getScanHistory(fastify, portalId) {
    const [rows] = await fastify.db.execute(
      `
      SELECT
        efficiency_score,
        efficiency_level,
        has_limited_visibility,
        contacts_total,
        users_total,
        workflows_total,
        critical_insights,
        warning_insights,
        created_at
      FROM scan_history
      WHERE portal_id = ?
      ORDER BY created_at ASC
      `,
      [portalId]
    );
  
    return rows;
  }
  