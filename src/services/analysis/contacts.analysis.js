import { fetchAllContacts } from "../hubspot/contacts.service.js";

/**
 * CONTACT QUALITY ANALYSIS (V3)
 */
export async function analyzeContacts(fastify, portalId, token) {
  const contacts = await fetchAllContacts(fastify, portalId, token);

  const total = contacts.length;

  if (total === 0) {
    return {
      total: 0,
      withoutEmail: 0,
      withoutLifecycle: 0,
      stale: 0,
      score: 50,
      limitedVisibility: false
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

  // 🎯 SCORE
  let score = 100;

  if (withoutEmail / total > 0.2) score -= 15;
  if (withoutLifecycle / total > 0.3) score -= 20;
  if (stale / total > 0.25) score -= 15;

  score = Math.max(40, Math.round(score));

  return {
    total,
    withoutEmail,
    withoutLifecycle,
    stale,
    score,
    limitedVisibility: false
  };
}
