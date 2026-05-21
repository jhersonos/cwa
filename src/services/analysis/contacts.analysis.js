// src/services/analysis/contacts.analysis.js
import { fetchAllContacts } from "../hubspot/contacts.service.js";
import {
  crmSearchTotal,
  filterAllRecords,
  msAgo,
} from "../hubspot/crmSearchTotals.service.js";

/**
 * CONTACT QUALITY ANALYSIS (V3)
 * Prioridad: conteos globales vía CRM Search (`total`), sin paginar toda la base.
 * Fallback: muestra acotada si Search falla (permisos / índice).
 */
export async function analyzeContacts(fastify, portalId, token) {
  const staleCutoffMs = msAgo(180);

  // Secuencial con corto-circuito: si el primer total falla, saltar las demás.
  const totalAll = await crmSearchTotal(token, "contacts", filterAllRecords());
  const noEmail  = totalAll == null ? null : await crmSearchTotal(token, "contacts", [
    { filters: [{ propertyName: "email", operator: "NOT_HAS_PROPERTY" }] },
  ]);
  const noPhone  = noEmail  == null ? null : await crmSearchTotal(token, "contacts", [
    {
      filters: [
        { propertyName: "phone",       operator: "NOT_HAS_PROPERTY" },
        { propertyName: "mobilephone", operator: "NOT_HAS_PROPERTY" },
      ],
    },
  ]);
  const noLife   = noPhone  == null ? null : await crmSearchTotal(token, "contacts", [
    { filters: [{ propertyName: "lifecyclestage", operator: "NOT_HAS_PROPERTY" }] },
  ]);
  const stale    = noLife   == null ? null : await crmSearchTotal(token, "contacts", [
    { filters: [{ propertyName: "hs_lastmodifieddate", operator: "LT", value: staleCutoffMs }] },
  ]);

  const searchFailed =
    totalAll == null ||
    noEmail == null ||
    noPhone == null ||
    noLife == null ||
    stale == null;

  if (searchFailed) {
    fastify.log.warn(
      { portalId },
      "Contacts: CRM Search totals unavailable, using sample fallback"
    );
    return analyzeContactsSample(fastify, portalId, token);
  }

  const total = totalAll;

  if (total === 0) {
    return {
      total: 0,
      withoutEmail: 0,
      withoutPhone: 0,
      withoutLifecycle: 0,
      stale: 0,
      score: 70,
      limitedVisibility: false,
      visibilityError: false,
      countsSource: "crm_search",
    };
  }

  const withoutEmail = noEmail;
  const withoutPhone = noPhone;
  const withoutLifecycle = noLife;
  const staleCount = stale;

  let score = 100;
  if (withoutEmail / total > 0.2) score -= 15;
  if (withoutPhone / total > 0.3) score -= 10;
  if (withoutLifecycle / total > 0.3) score -= 20;
  if (staleCount / total > 0.25) score -= 15;
  score = Math.max(40, Math.round(score));

  return {
    total,
    withoutEmail,
    withoutPhone,
    withoutLifecycle,
    stale: staleCount,
    score,
    limitedVisibility: false,
    visibilityError: false,
    countsSource: "crm_search",
  };
}

async function analyzeContactsSample(fastify, portalId, token) {
  let contacts = [];
  let limitedVisibility = false;
  let visibilityError = false;

  try {
    contacts = await fetchAllContacts(fastify, portalId, token, {
      limit: 100,
    });

    if (!Array.isArray(contacts)) {
      contacts = [];
      limitedVisibility = true;
      visibilityError = true;
    }
  } catch (err) {
    const status = err?.response?.status;
    if (status === 401 || status === 403 || status === 429) {
      limitedVisibility = true;
      visibilityError = true;
      contacts = [];
    } else {
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

  if (total === 0) {
    return {
      total: 0,
      withoutEmail: 0,
      withoutPhone: 0,
      withoutLifecycle: 0,
      stale: 0,
      score: 70,
      limitedVisibility: false,
      visibilityError: false,
      countsSource: "sample",
    };
  }

  const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;

  let withoutEmail = 0;
  let withoutPhone = 0;
  let withoutLifecycle = 0;
  let stale = 0;

  for (const c of contacts) {
    const p = c.properties || {};
    if (!p.email) withoutEmail++;
    if (!p.phone && !p.mobilephone) withoutPhone++;
    if (!p.lifecyclestage) withoutLifecycle++;
    if (p.hs_lastmodifieddate) {
      const last = new Date(p.hs_lastmodifieddate).getTime();
      if (last < sixMonthsAgo) stale++;
    }
  }

  let score = 100;
  if (withoutEmail / total > 0.2) score -= 15;
  if (withoutPhone / total > 0.3) score -= 10;
  if (withoutLifecycle / total > 0.3) score -= 20;
  if (stale / total > 0.25) score -= 15;
  if (visibilityError) score -= 10;
  score = Math.max(40, Math.round(score));

  return {
    total,
    withoutEmail,
    withoutPhone,
    withoutLifecycle,
    stale,
    score,
    limitedVisibility: visibilityError,
    visibilityError,
    countsSource: "sample",
  };
}
