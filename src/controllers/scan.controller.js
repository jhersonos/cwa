// src/controllers/scan.controller.js

import { analyzeContacts } from "../services/analysis/contacts.analysis.js";
import { analyzeUsers } from "../services/analysis/users.analysis.js";
import { analyzeWorkflows } from "../services/analysis/workflows.analysis.js";

import { getValidAccessToken } from "../services/hubspot/token.service.js";

import {
  calculateEfficiencyScore,
  getEfficiencyLevel
} from "../services/analysis/efficiencyScore.service.js";

import { generateInsights } from "../services/analysis/insights.service.js";
import { generatePrioritization } from "../services/analysis/prioritization.service.js";

import { saveScanSnapshot } from "../services/history/history.service.js";
import { calculateBenchmark } from "../services/analysis/benchmark.service.js";

/**
 * 🔒 SCAN V3 — MARKETPLACE SAFE
 */
export async function runScanV3(req, reply) {
  const { portalId } = req.query;

  if (!portalId) {
    return reply.code(400).send({ error: "Missing portalId" });
  }

  const start = Date.now();

  try {
    /* ------------------------
       AUTH
    ------------------------ */
    const token = await getValidAccessToken(req.server, portalId);

    /* ------------------------
       FASE 4 — BASE SCANS (AISLADOS)
    ------------------------ */
    const [contacts, users] = await Promise.all([
      analyzeContacts(req.server, portalId, token),
      analyzeUsers(req.server, portalId, token)
    ]);

    /* ------------------------
       FASE 8 — WORKFLOWS (NO BLOQUEANTE)
    ------------------------ */
    let workflows = {
      total: 0,
      inactive: 0,
      highComplexity: 0,
      legacy: 0,
      limitedVisibility: true
    };

    try {
      workflows = await analyzeWorkflows(req.server, portalId, token);
    } catch (err) {
      req.server.log.warn(
        { portalId },
        "Workflows analysis skipped (permissions or plan)"
      );
    }

    /* ------------------------
       FASE 5 — EFFICIENCY
    ------------------------ */
    const efficiencyResult = calculateEfficiencyScore({
      contacts,
      users
    });

    const efficiency = {
      score: efficiencyResult.score,
      level: getEfficiencyLevel(efficiencyResult.score),
      hasLimitedVisibility:
        efficiencyResult.hasLimitedVisibility || workflows.limitedVisibility
    };

    /* ------------------------
       FASE 6 — INSIGHTS
    ------------------------ */
    const insights = generateInsights({
      efficiency,
      contacts,
      users,
      workflows
    });

    /* ------------------------
       FASE 7 — PRIORITIZATION
    ------------------------ */
    const prioritization = generatePrioritization(insights);

    /* ------------------------
       FASE 9 — HISTORY (NO BLOQUEANTE)
    ------------------------ */
    try {
      await saveScanSnapshot(req.server, {
        portalId,
        efficiencyScore: efficiency.score,
        efficiencyLevel: efficiency.level,
        hasLimitedVisibility: efficiency.hasLimitedVisibility,
        contactsTotal: contacts.total,
        usersTotal: users.total,
        workflowsTotal: workflows.total,
        criticalInsights: prioritization.summary.critical,
        warningInsights: prioritization.summary.warning
      });
    } catch (err) {
      req.server.log.warn(
        { portalId },
        "Failed saving scan history"
      );
    }

    /* ------------------------
       FASE 10 — BENCHMARK (NO BLOQUEANTE)
    ------------------------ */
    let benchmark = null;
    try {
      benchmark = await calculateBenchmark(req.server, {
        efficiencyScore: efficiency.score,
        contactsTotal: contacts.total
      });
    } catch (err) {
      req.server.log.warn(
        { portalId },
        "Benchmark calculation skipped"
      );
    }

    const duration = Date.now() - start;

    req.server.log.info(
      { portalId, duration },
      "Scan V3 completed"
    );

    /* ------------------------
       RESPONSE FINAL
    ------------------------ */
    return {
      version: "v3",
      portalId,
      efficiency,
      benchmark,
      prioritization,
      insights,
      contacts,
      users,
      workflows,
      meta: {
        durationMs: duration
      }
    };
  } catch (err) {
    req.server.log.error(
      { err, portalId },
      "Fatal error running scan v3"
    );

    return reply.code(500).send({
      error: "Scan failed",
      message: err.message || "Unexpected error"
    });
  }
}
