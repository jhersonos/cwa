// src/services/analysis/contacts.analysis.js

import { fetchAllContacts } from "../hubspot/contacts.service.js";

/**
 * CONTACT QUALITY ANALYSIS (V3)
 * ⚠️ SAFE VERSION (NO TIMEOUTS, NO FATAL ERRORS)
 */
export async function analyzeContacts(fastify, portalId, token) {
  let contacts = [];
  let limitedVisibility = false;

  try {
    // ⛔ IMPORTANTE:
    // fetchAllContacts DEBE soportar límite interno
    contacts = await fetchAllContacts(fastify, portalId, token, {
      limit: 500 // 🔒 sample máximo
    });

    if (!Array.isArray(contacts)) {
      contacts = [];
      limitedVisibility = true;
    }
  } catch (err) {
    const status = err?.response?.status;

    // 🚫 RATE LIMIT / PERMISOS → degradar
    if (status === 429 || status === 403 || status === 401) {
      limitedVisibility = true;
      contacts = [];
    } else {
      // 🔥 error inesperado → log pero NO romper
      fastify.log.error(
        { err, portalId },
        "Contact analysis failed unexpectedly"
      );
      limitedVisibility = true;
      contacts = [];
    }
  }

  const total = contacts.length;

  // 🟡 SIN DATOS → score conservador
  if (total === 0) {
    return {
      total: 0,
      withoutEmail: 0,
      withoutLifecycle: 0,
      stale: 0,
      score: 70,
      limitedVisibility: true
    };
  }

  const twelveMonthsAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;

  let withoutEmail = 0;
  let withoutLifecycle = 0;
  let stale = 0;

  for (const c of contacts) {
    const p = c.properties || {};

    if (!p.email) withoutEmail++;
    if (!p.lifecyclestage) withoutLifecycle++;

    if (p.hs_lastmodifieddate) {
      const last = new Date(p.hs_lastmodifieddate).getTime();
      if (last < twelveMonthsAgo) stale++;
    }
  }

  /* ------------------------
     SCORE (NORMALIZED)
  ------------------------ */
  let score = 100;

  if (withoutEmail / total > 0.2) score -= 15;
  if (withoutLifecycle / total > 0.3) score -= 20;
  if (stale / total > 0.25) score -= 15;

  // ⛔ Ajuste por sample / visibilidad limitada
  if (limitedVisibility) score -= 10;

  score = Math.max(40, Math.round(score));

  return {
    total,
    withoutEmail,
    withoutLifecycle,
    stale,
    score,
    limitedVisibility
  };
}
