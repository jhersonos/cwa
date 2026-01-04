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

export async function runScanV3(req, reply) {
  const { portalId } = req.query;

  if (!portalId) {
    return reply.code(400).send({ error: "Missing portalId" });
  }

  /* ------------------------
     AUTH / TOKEN
  ------------------------ */
  const token = await getValidAccessToken(req.server, portalId);

  /* ------------------------
     FAST SCAN (UI SAFE)
  ------------------------ */
  const contacts = await analyzeContacts(req.server, portalId, token);
  const users = await analyzeUsers(req.server, portalId, token);

  /* ------------------------
     WORKFLOWS (BEST EFFORT)
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
  } catch (_) {
    // ignore (Free / Starter accounts)
  }

  /* ------------------------
     EFFICIENCY
  ------------------------ */
  const efficiencyResult = calculateEfficiencyScore({ contacts, users });

  const efficiency = {
    score: efficiencyResult.score,
    level: getEfficiencyLevel(efficiencyResult.score),
    hasLimitedVisibility:
      efficiencyResult.hasLimitedVisibility || workflows.limitedVisibility
  };

  /* ------------------------
     INSIGHTS + PRIORITIZATION
  ------------------------ */
  const insights = generateInsights({
    efficiency,
    contacts,
    users,
    workflows
  });

  const prioritization = generatePrioritization(insights);

  /* ------------------------
     🚀 RESPUESTA INMEDIATA (UI)
  ------------------------ */
  reply.send({
    version: "v3",
    portalId,
    efficiency,
    prioritization,
    insights,
    contacts,
    users,
    workflows
  });

  /* =====================================================
     ⏳ BACKGROUND TASKS (NO BLOQUEAN UI)
     ===================================================== */

  setImmediate(async () => {
    try {
      // FASE 9 — HISTORY
      await saveScanSnapshot(req.server, {
        portalId,
        efficiencyScore: efficiency.score,
        efficiencyLevel: efficiency.level,
        hasLimitedVisibility: efficiency.hasLimitedVisibility,
        contactsTotal: contacts.total,
        usersTotal: users.total,
        workflowsTotal: workflows.total,
        criticalInsights: prioritization.summary?.critical ?? 0,
        warningInsights: prioritization.summary?.warning ?? 0
      });

      // FASE 10 — BENCHMARK
      await calculateBenchmark(req.server, {
        efficiencyScore: efficiency.score,
        contactsTotal: contacts.total
      });
    } catch (err) {
      req.server.log.error(
        { err, portalId },
        "Post-scan background processing failed"
      );
    }
  });
}
