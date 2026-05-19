// src/controllers/scan.controller.js

import { analyzeContacts } from "../services/analysis/contacts.analysis.js";
import { analyzeDeals } from "../services/analysis/deals.analysis.js";
import { analyzeCompanies } from "../services/analysis/companies.analysis.js";
import { analyzeToolsUsage } from "../services/analysis/tools.analysis.js";

import { getValidAccessToken } from "../services/hubspot/token.service.js";

import {
  calculateEfficiencyScore,
  getEfficiencyLevel
} from "../services/analysis/efficiencyScore.service.js";

import { generateInsights } from "../services/analysis/insights.service.js";
import { generatePrioritization } from "../services/analysis/prioritization.service.js";
import { calculateAllTrafficLights } from "../services/analysis/trafficLight.service.js";

import {
  saveScanSnapshot,
  getFreeScanQuota,
  getLastScanResult
} from "../services/history/history.service.js";
import { calculateBenchmark } from "../services/analysis/benchmark.service.js";
import {
  checkUnlockStatus,
  normalizePortalId
} from "../services/unlock/token.service.js";

/**
 * 🔒 SCAN V3 — MARKETPLACE SAFE
 */
export async function runScanV3(req, reply) {
  const portalId = normalizePortalId(req.query.portalId);

  if (!portalId) {
    return reply.code(400).send({ error: "Missing portalId" });
  }

  const start = Date.now();

  try {
    /* ------------------------
       FREE TIER: máx. 1 análisis / semana si no hay desbloqueo.
       Pro / auditoría desbloqueada: checkUnlockStatus.unlocked → sin cuota (getFreeScanQuota).
    ------------------------ */
    const unlockStatus = await checkUnlockStatus(req.server, portalId);
    const quota = await getFreeScanQuota(
      req.server,
      unlockStatus.portalId || portalId,
      Boolean(unlockStatus.unlocked)
    );
    if (!quota.allowed) {
      return reply.code(429).send({
        error: "SCAN_COOLDOWN",
        message:
          "El análisis gratuito está limitado a una vez por semana. Podrás volver a ejecutarlo a partir de la fecha indicada, o desbloquear la auditoría completa para análisis ilimitados.",
        nextAllowedAt: quota.nextAllowedAt,
        lastScanAt: quota.lastScanAt
      });
    }

    /* ------------------------
       AUTH
    ------------------------ */
    const token = await getValidAccessToken(req.server, portalId);

    /* ------------------------
       FASE 4 — BASE SCANS (AISLADOS)
       🚀 Análisis rápido - core objects + tools (optimizado)
    ------------------------ */
    const scanOpts = { unlocked: Boolean(unlockStatus.unlocked) };

    const results = await Promise.allSettled([
      analyzeContacts(req.server, portalId, token, scanOpts),
      analyzeDeals(req.server, portalId, token, scanOpts),
      analyzeCompanies(req.server, portalId, token, scanOpts),
      analyzeToolsUsage(req.server, portalId, token),
    ]);

    // 🛡️ Extraer resultados con fallbacks seguros (misma forma que analyze* para insights/export)
    const contacts =
      results[0].status === 'fulfilled'
        ? results[0].value
        : {
            total: 0,
            score: 100,
            withoutEmail: 0,
            withoutPhone: 0,
            withoutLifecycle: 0,
            stale: 0,
            limitedVisibility: true,
            countsSource: 'sample',
          };
    // Users analysis disabled temporarily to remove settings.users.read dependency.
    const users = {
      total: 0,
      inactive: 0,
      score: 100,
      limitedVisibility: true,
      disabledByScopePolicy: true,
    };
    const deals =
      results[1].status === 'fulfilled'
        ? results[1].value
        : {
            total: 0,
            withoutContact: { count: 0, percentage: 0, score: 100 },
            withoutOwner: { count: 0, percentage: 0, score: 100 },
            withoutPrice: { count: 0, percentage: 0, score: 100 },
            inactive: { count: 0, percentage: 0, score: 100 },
            stagesSummary: [],
            averageActivities: 0,
            limitedVisibility: true,
            countsSource: 'sample',
          };
    const companies =
      results[2].status === 'fulfilled'
        ? results[2].value
        : {
            total: 0,
            withoutDomain: { count: 0, percentage: 0, score: 100 },
            withoutOwner: { count: 0, percentage: 0, score: 100 },
            withoutPhone: { count: 0, percentage: 0, score: 100 },
            inactive: { count: 0, percentage: 0, score: 100 },
            averageActivities: 0,
            limitedVisibility: true,
            countsSource: 'sample',
          };
    const tools = results[3].status === 'fulfilled' ? results[3].value : { unused: [], inUse: [], totalTools: 0, usagePercentage: 0, limitedVisibility: true };

    
    /* ------------------------
       FASE 5 — EFFICIENCY
    ------------------------ */
    const efficiencyResult = calculateEfficiencyScore({
      contacts,
      users,
      deals,
      companies
    });

    const efficiency = {
      score: efficiencyResult.score,
      level: getEfficiencyLevel(efficiencyResult.score),
      hasLimitedVisibility: efficiencyResult.hasLimitedVisibility
    };

    /* ------------------------
       FASE 6 — INSIGHTS
    ------------------------ */
    const insights = generateInsights({
      efficiency,
      contacts,
      users,
      deals,
      companies,
      tools
    });

    /* ------------------------
       FASE 7 — PRIORITIZATION
    ------------------------ */
    const prioritization = generatePrioritization(insights);

    /* ------------------------
       FASE 8 — TRAFFIC LIGHTS
    ------------------------ */
    const trafficLights = calculateAllTrafficLights({
      contacts,
      users,
      deals,
      companies
    });

    /* ------------------------
       FASE 9 — BENCHMARK (NO BLOQUEANTE)
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

    const responseBody = {
      version: "v3",
      portalId: unlockStatus.portalId || portalId,
      efficiency,
      benchmark,
      prioritization,
      insights,
      contacts,
      users,
      deals,
      companies,
      tools,
      trafficLights,
      access: {
        unlocked: Boolean(unlockStatus.unlocked),
        expiresAt: unlockStatus.expiresAt || null,
        freeScanAllowed: quota.allowed,
        nextFreeScanAt: quota.nextAllowedAt,
        lastFreeScanAt: quota.lastScanAt
      },
      meta: {
        durationMs: duration,
        unlocked: Boolean(unlockStatus.unlocked)
      }
    };

    /* ------------------------
       FASE 10 — HISTORY + PAYLOAD COMPLETO (NO BLOQUEANTE; rehidratación UI)
    ------------------------ */
    try {
      await saveScanSnapshot(req.server, {
        portalId,
        efficiencyScore: efficiency.score,
        efficiencyLevel: efficiency.level,
        hasLimitedVisibility: efficiency.hasLimitedVisibility,
        contactsTotal: contacts.total,
        usersTotal: users.total,
        criticalInsights: prioritization.summary.critical,
        warningInsights: prioritization.summary.warning,
        dealsTotal: deals.total,
        dealsWithoutContact: deals.withoutContact?.count || 0,
        dealsWithoutOwner: deals.withoutOwner?.count || 0,
        dealsWithoutPrice: deals.withoutPrice?.count || 0,
        dealsInactive: deals.inactive?.count || 0,
        companiesTotal: companies.total,
        companiesWithoutDomain: companies.withoutDomain?.count || 0,
        companiesWithoutOwner: companies.withoutOwner?.count || 0,
        companiesInactive: companies.inactive?.count || 0,
        toolsInUse: tools.inUse?.length || 0,
        toolsTotal: tools.totalTools || 0,
        toolsUsagePercentage: tools.usagePercentage || 0,
        contactsScore: trafficLights.contacts?.score || 100,
        dealsScore: trafficLights.deals?.score || 100,
        companiesScore: trafficLights.companies?.score || 100,
        usersScore: trafficLights.users?.score || 100,
        resultPayload: responseBody
      });
    } catch (err) {
      req.server.log.warn(
        { portalId },
        "Failed saving scan history"
      );
    }

    req.server.log.info(
      { portalId, duration },
      "Scan V3 completed"
    );

    return responseBody;
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

/**
 * GET /api/scan-v3/last?portalId=
 * Devuelve el último análisis completo persistido (no consume cuota free).
 */
export async function getLastScanV3(req, reply) {
  const { portalId } = req.query;

  if (!portalId) {
    return reply.code(400).send({ error: "Missing portalId" });
  }

  try {
    const last = await getLastScanResult(req.server, portalId);
    if (!last?.payload) {
      return reply.code(404).send({
        error: "NO_SCAN_STORED",
        message: "No hay análisis guardado para este portal. Ejecuta un análisis en la app."
      });
    }
    return {
      portalId,
      scannedAt: last.scannedAt,
      result: last.payload
    };
  } catch (err) {
    req.server.log.error({ err, portalId }, "getLastScanV3 failed");
    return reply.code(500).send({ error: "Failed to load last scan" });
  }
}
