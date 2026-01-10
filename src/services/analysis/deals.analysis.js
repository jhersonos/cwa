// src/services/analysis/deals.analysis.js
import axios from "axios";

const HUBSPOT_API = "https://api.hubapi.com";
const THREE_MONTHS = 90 * 24 * 60 * 60 * 1000;

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
    amount: props.amount ? Number(props.amount) : null,
    lastModified: props.hs_lastmodifieddate || null
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
          limit: 50,
          properties: [
            "dealname",
            "dealstage",
            "amount",
            "hubspot_owner_id",
            "hs_lastmodifieddate",
            "closedate",
            "pipeline"
          ].join(",")
        },
        timeout: 2500 // 🚀 Velocidad máxima
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
      withoutPrice: {
        count: 0,
        percentage: 0,
        score: 100,
        items: []
      },
      inactive: {
        count: 0,
        percentage: 0,
        score: 100,
        items: []
      },
      stagesSummary: [],
      averageActivities: 0,
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
          timeout: 2500
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

  /* ----------------------------------
     DEALS SIN PRECIO
  ---------------------------------- */

  const dealsWithoutPrice = deals
    .filter(d => !d.properties?.amount || Number(d.properties.amount) === 0)
    .map(normalizeDeal);

  const withoutPriceCount = dealsWithoutPrice.length;
  const withoutPricePercentage = Number(
    ((withoutPriceCount / totalDeals) * 100).toFixed(1)
  );

  /* ----------------------------------
     DEALS INACTIVOS (3 MESES)
  ---------------------------------- */

  const threeMonthsAgo = Date.now() - THREE_MONTHS;
  const inactiveDeals = deals
    .filter(d => {
      const lastMod = d.properties?.hs_lastmodifieddate;
      if (!lastMod) return false;
      return new Date(lastMod).getTime() < threeMonthsAgo;
    })
    .map(normalizeDeal);

  const inactiveCount = inactiveDeals.length;
  const inactivePercentage = Number(
    ((inactiveCount / totalDeals) * 100).toFixed(1)
  );

  /* ----------------------------------
     RESUMEN POR ETAPAS
  ---------------------------------- */

  const stagesSummary = {};
  deals.forEach(d => {
    const stage = d.properties?.dealstage || "Sin etapa";
    if (!stagesSummary[stage]) {
      stagesSummary[stage] = 0;
    }
    stagesSummary[stage]++;
  });

  const stagesArray = Object.entries(stagesSummary).map(([stage, count]) => ({
    stage,
    count,
    percentage: Number(((count / totalDeals) * 100).toFixed(1))
  }));

  /* ----------------------------------
     PROMEDIO DE ACTIVIDADES POR DEAL
  ---------------------------------- */

  let totalActivities = 0;
  let dealsWithActivities = 0;

  // Fetch actividades para una muestra de deals (primeros 10)
  const sampleSize = Math.min(10, totalDeals);
  for (let i = 0; i < sampleSize; i++) {
    try {
      const activitiesRes = await axios.get(
        `${HUBSPOT_API}/crm/v3/objects/deals/${deals[i].id}/associations/activities`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          timeout: 2500
        }
      );

      const activityCount = activitiesRes.data?.results?.length || 0;
      totalActivities += activityCount;
      dealsWithActivities++;
    } catch {
      // Ignorar errores individuales
      limitedVisibility = true;
    }
  }

  const averageActivities = dealsWithActivities > 0
    ? Number((totalActivities / dealsWithActivities).toFixed(1))
    : 0;

  /* ----------------------------------
     RESPONSE
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
    },
    withoutPrice: {
      count: withoutPriceCount,
      percentage: withoutPricePercentage,
      score: calculateScore(withoutPricePercentage),
      items: dealsWithoutPrice
    },
    inactive: {
      count: inactiveCount,
      percentage: inactivePercentage,
      score: calculateScore(inactivePercentage),
      items: inactiveDeals
    },
    stagesSummary: stagesArray,
    averageActivities,
    limitedVisibility
  };
}
