// src/services/analysis/deals.analysis.js
import axios from "axios";

const HUBSPOT_API = "https://api.hubapi.com";

/* ----------------------------------
   HELPERS
---------------------------------- */

function calculateScore(percentage) {
  if (percentage === 0) return 100;
  if (percentage <= 5) return 85;
  if (percentage <= 15) return 60;
  return 30;
}

function normalizeDeal(deal) {
  const props = deal.properties || {};

  return {
    id: deal.id,
    name: props.dealname || `Deal ${deal.id}`,
    stage: props.dealstage || null,
    amount: props.amount ? Number(props.amount) : null
  };
}

/* ----------------------------------
   MAIN ANALYSIS FUNCTION
---------------------------------- */

export async function analyzeDeals(fastify, portalId, token) {
  let deals = [];
  let limitedVisibility = false;

  try {
    const res = await axios.get(
      `${HUBSPOT_API}/crm/v3/objects/deals`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          limit: 100,
          properties: [
            "dealname",
            "dealstage",
            "amount",
            "hubspot_owner_id"
          ].join(",")
        },
        timeout: 8000
      }
    );

    deals = res.data?.results || [];
  } catch (err) {
    const status = err?.response?.status;

    if (status === 401 || status === 403 || status === 429) {
      limitedVisibility = true;
      deals = [];
    } else {
      fastify.log.error(
        { err, portalId },
        "Deal analysis failed unexpectedly"
      );
      limitedVisibility = true;
      deals = [];
    }
  }

  const totalDeals = deals.length;

  if (totalDeals === 0) {
    return {
      total: 0,
      withoutContact: {
        count: 0,
        percentage: 0,
        score: 100,
        items: []
      },
      withoutOwner: {
        count: 0,
        percentage: 0,
        score: 100,
        items: []
      },
      limitedVisibility
    };
  }

  /* ----------------------------------
     CONTACT ASSOCIATIONS
  ---------------------------------- */

  const dealsWithoutContact = [];

  for (const deal of deals) {
    try {
      const assocRes = await axios.get(
        `${HUBSPOT_API}/crm/v3/objects/deals/${deal.id}/associations/contacts`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          timeout: 6000
        }
      );

      if (!assocRes.data?.results?.length) {
        dealsWithoutContact.push(normalizeDeal(deal));
      }
    } catch {
      limitedVisibility = true;
    }
  }

  const withoutContactCount = dealsWithoutContact.length;
  const withoutContactPercentage = Number(
    ((withoutContactCount / totalDeals) * 100).toFixed(1)
  );

  /* ----------------------------------
     OWNER CHECK
  ---------------------------------- */

  const dealsWithoutOwner = deals
    .filter(d => !d.properties?.hubspot_owner_id)
    .map(normalizeDeal);

  const withoutOwnerCount = dealsWithoutOwner.length;
  const withoutOwnerPercentage = Number(
    ((withoutOwnerCount / totalDeals) * 100).toFixed(1)
  );

  return {
    total: totalDeals,
    withoutContact: {
      count: withoutContactCount,
      percentage: withoutContactPercentage,
      score: calculateScore(withoutContactPercentage),
      items: dealsWithoutContact
    },
    withoutOwner: {
      count: withoutOwnerCount,
      percentage: withoutOwnerPercentage,
      score: calculateScore(withoutOwnerPercentage),
      items: dealsWithoutOwner
    },
    limitedVisibility
  };
}
