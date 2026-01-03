// src/services/analysis/benchmark.service.js

function getCohort(contactsTotal) {
    if (contactsTotal < 1000) return "small";
    if (contactsTotal <= 10000) return "medium";
    return "large";
  }
  
  export async function calculateBenchmark(fastify, currentSnapshot) {
    const cohort = getCohort(currentSnapshot.contactsTotal);
  
    let whereClause = "";
    if (cohort === "small") {
      whereClause = "contacts_total < 1000";
    } else if (cohort === "medium") {
      whereClause = "contacts_total BETWEEN 1000 AND 10000";
    } else {
      whereClause = "contacts_total > 10000";
    }
  
    const [rows] = await fastify.db.execute(
      `
      SELECT
        AVG(efficiency_score) AS avg_efficiency,
        AVG(critical_insights) AS avg_critical,
        AVG(warning_insights) AS avg_warning
      FROM scan_history
      WHERE ${whereClause}
      `
    );
  
    const benchmark = rows[0] || {};
  
    const efficiencyDelta =
      currentSnapshot.efficiencyScore - (benchmark.avg_efficiency || 0);
  
    return {
      cohort,
      benchmark: {
        avgEfficiency: Math.round(benchmark.avg_efficiency || 0),
        avgCriticalInsights: Math.round(benchmark.avg_critical || 0),
        avgWarningInsights: Math.round(benchmark.avg_warning || 0)
      },
      comparison: {
        efficiencyDelta
      }
    };
  }
  