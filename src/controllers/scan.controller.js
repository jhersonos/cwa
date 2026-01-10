// src/controllers/scan.controller.js

import { analyzeContacts } from "../services/analysis/contacts.analysis.js";
import { analyzeUsers } from "../services/analysis/users.analysis.js";
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
       🚀 Análisis rápido - solo core objects
       ⏱️ Tools analysis opcional por performance
    ------------------------ */
    const results = await Promise.allSettled([
      analyzeContacts(req.server, portalId, token),
      analyzeUsers(req.server, portalId, token),
      analyzeDeals(req.server, portalId, token),
      analyzeCompanies(req.server, portalId, token)
      // Tools eliminado temporalmente por performance
    ]);

    // 🛡️ Extraer resultados con fallbacks seguros
    const contacts = results[0].status === 'fulfilled' ? results[0].value : { total: 0, score: 100, withoutEmail: 0, withoutPhone: 0, withoutLifecycle: 0, stale: 0, limitedVisibility: true };
    const users = results[1].status === 'fulfilled' ? results[1].value : { total: 0, score: 100, active: 0, limitedVisibility: true };
    const deals = results[2].status === 'fulfilled' ? results[2].value : { total: 0, withoutContact: { count: 0, score: 100 }, withoutOwner: { count: 0, score: 100 }, withoutPrice: { count: 0, score: 100 }, inactive: { count: 0, score: 100 }, limitedVisibility: true };
    const companies = results[3].status === 'fulfilled' ? results[3].value : { total: 0, withoutDomain: { count: 0, score: 100 }, withoutOwner: { count: 0, score: 100 }, withoutPhone: { count: 0, score: 100 }, inactive: { count: 0, score: 100 }, limitedVisibility: true };
    
    // 🚀 Tools analysis deshabilitado por performance (15s → 8s)
    const tools = { 
      unused: [], 
      inUse: [], 
      totalTools: 0, 
      usagePercentage: 0, 
      limitedVisibility: false 
    };

    
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
        criticalInsights: prioritization.summary.critical,
        warningInsights: prioritization.summary.warning,
        // Nuevas métricas
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
        usersScore: trafficLights.users?.score || 100
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
       deals,
       companies,
       tools,
       trafficLights,
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
