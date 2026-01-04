import { hubspotRequest } from "../hubspot.js";

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

export async function analyzeDeals({ portalId, accessToken }) {
  try {
    /* ----------------------------------
       1. GET DEALS
    ---------------------------------- */

    const dealsResponse = await hubspotRequest({
      accessToken,
      method: "GET",
      endpoint: "/crm/v3/objects/deals",
      params: {
        limit: 100,
        properties: ["dealname", "dealstage", "amount", "hubspot_owner_id"]
      }
    });

    const deals = dealsResponse?.results || [];
    const totalDeals = deals.length;

    if (!totalDeals) {
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
        }
      };
    }

    /* ----------------------------------
       2. CHECK CONTACT ASSOCIATIONS
    ---------------------------------- */

    const dealsWithoutContact = [];

    for (const deal of deals) {
      const assocResponse = await hubspotRequest({
        accessToken,
        method: "GET",
        endpoint: `/crm/v3/objects/deals/${deal.id}/associations/contacts`
      });

      const hasContacts =
        Array.isArray(assocResponse?.results) &&
        assocResponse.results.length > 0;

      if (!hasContacts) {
        dealsWithoutContact.push(normalizeDeal(deal));
      }
    }

    const withoutContactCount = dealsWithoutContact.length;
    const withoutContactPercentage = Number(
      ((withoutContactCount / totalDeals) * 100).toFixed(1)
    );

    /* ----------------------------------
       3. CHECK OWNER
    ---------------------------------- */

    const dealsWithoutOwner = deals
      .filter(deal => !deal.properties?.hubspot_owner_id)
      .map(normalizeDeal);

    const withoutOwnerCount = dealsWithoutOwner.length;
    const withoutOwnerPercentage = Number(
      ((withoutOwnerCount / totalDeals) * 100).toFixed(1)
    );

    /* ----------------------------------
       4. RETURN FINAL RESULT
    ---------------------------------- */

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
      }
    };
  } catch (error) {
    console.error("[Deals Analysis Error]", error?.response?.data || error);

    return {
      limitedVisibility: true,
      error: "Unable to analyze deals with current permissions"
    };
  }
}
