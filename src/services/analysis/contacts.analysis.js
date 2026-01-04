import { fetchAllContacts } from "../hubspot/contacts.service.js";

/**
 * CONTACT QUALITY ANALYSIS (V3)
 * ✅ V1 SAFE
 * - No penaliza cuentas vacías
 * - Solo marca visibilidad limitada ante errores reales
 * - Marketplace friendly
 */
export async function analyzeContacts(fastify, portalId, token) {
  let contacts = [];
  let limitedVisibility = false;
  let visibilityError = false;

  try {
    // 🔒 Sample controlado para evitar timeouts
    contacts = await fetchAllContacts(fastify, portalId, token, {
      limit: 500
    });

    if (!Array.isArray(contacts)) {
      contacts = [];
      limitedVisibility = true;
      visibilityError = true;
    }
  } catch (err) {
    const status = err?.response?.status;

    // 🚫 Permisos / rate limit → visibilidad limitada REAL
    if (status === 401 || status === 403 || status === 429) {
      limitedVisibility = true;
      visibilityError = true;
      contacts = [];
    } else {
      // 🔥 Error inesperado → log, pero no romper el scan
      fastify.log.error(
        { err, portalId },
        "Contact analysis failed unexpectedly"
      );
      limitedVisibility = true;
      visibilityError = true;
      contacts = [];
    }
  }

  const total = contacts.length;

  /* --------------------------------------------------
     🟢 CUENTA VACÍA ≠ ERROR
  -------------------------------------------------- */
  if (total === 0) {
    return {
      total: 0,
      withoutEmail: 0,
      withoutLifecycle: 0,
      stale: 0,
      score: 70,                 // baseline conservador
      limitedVisibility: false,  // ✅ NO es error
      visibilityError: false
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

  /* --------------------------------------------------
     🎯 SCORE (NORMALIZADO)
  -------------------------------------------------- */
  let score = 100;

  if (withoutEmail / total > 0.2) score -= 15;
  if (withoutLifecycle / total > 0.3) score -= 20;
  if (stale / total > 0.25) score -= 15;

  // ⛔ Penalización SOLO si hubo error real
  if (visibilityError) score -= 10;

  score = Math.max(40, Math.round(score));

  return {
    total,
    withoutEmail,
    withoutLifecycle,
    stale,
    score,
    limitedVisibility: visibilityError,
    visibilityError
  };
}
