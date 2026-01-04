import axios from "axios";

/**
 * CONTACT QUALITY ANALYSIS (V3)
 * - Sample-based
 * - Rate-limit safe
 * - Fast enough for HubSpot UI
 */
export async function analyzeContacts(fastify, portalId, token) {
  const baseUrl = "https://api.hubapi.com";

  const PAGE_SIZE = 100;
  const MAX_PAGES = 5; // 👈 máximo 500 contactos
  const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

  let total = 0;
  let withoutEmail = 0;
  let withoutLifecycle = 0;
  let stale = 0;
  let after;
  let limitedVisibility = false;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await axios.get(
        `${baseUrl}/crm/objects/v3/contacts`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          params: {
            limit: PAGE_SIZE,
            after,
            properties: [
              "email",
              "lifecyclestage",
              "hs_lastmodifieddate"
            ].join(",")
          }
        }
      );

      const results = res.data.results || [];
      total += results.length;

      for (const c of results) {
        const p = c.properties || {};

        if (!p.email) withoutEmail++;
        if (!p.lifecyclestage) withoutLifecycle++;

        if (p.hs_lastmodifieddate) {
          const last = new Date(p.hs_lastmodifieddate).getTime();
          if (Date.now() - last > ONE_YEAR) stale++;
        }
      }

      after = res.data.paging?.next?.after;
      if (!after) break;
    }
  } catch (err) {
    if (err.response?.status === 429) {
      // Rate limit → degrade gracefully
      limitedVisibility = true;
    } else {
      throw err;
    }
  }

  if (total === 0) {
    return {
      total: 0,
      withoutEmail: 0,
      withoutLifecycle: 0,
      stale: 0,
      score: 50,
      limitedVisibility
    };
  }

  // 🎯 SCORE (same logic, just safer)
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
    limitedVisibility
  };
}
