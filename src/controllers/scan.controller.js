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
     FASE 4 — SCANS BASE
  ------------------------ */
  const contacts = await analyzeContacts(req.server, portalId, token);
  const users = await analyzeUsers(req.server, portalId, token);

  /* ------------------------
     FASE 8 — WORKFLOWS
  ------------------------ */
  const workflows = await analyzeWorkflows(req.server, portalId, token);

  /* ------------------------
     FASE 5 — EFFICIENCY SCORE
  ------------------------ */
  const efficiencyResult = calculateEfficiencyScore({ contacts, users });

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
     FASE 9 — HISTORICAL SNAPSHOT (BD)
  ------------------------ */
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

  /* ------------------------
     FASE 10 — BENCHMARKING
  ------------------------ */
  const benchmark = await calculateBenchmark(req.server, {
    efficiencyScore: efficiency.score,
    contactsTotal: contacts.total
  });

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
    workflows
  };
}
