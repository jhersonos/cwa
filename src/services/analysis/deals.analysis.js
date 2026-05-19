// src/services/analysis/deals.analysis.js
import axios from "axios";
import {
  crmSearchFetch,
  crmSearchTotal,
  filterAllRecords,
  msAgo,
} from "../hubspot/crmSearchTotals.service.js";

const HUBSPOT_API = "https://api.hubapi.com";
const THREE_MONTHS = 90 * 24 * 60 * 60 * 1000;

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
    lastModified: props.hs_lastmodifieddate || null,
  };
}

/**
 * Cuenta deals sin contacto asociado (asociaciones v1) — solo si Search no expone total.
 */
async function countDealsWithoutContactAssociationSample(token, limit = 25) {
  let deals = [];
  try {
    const res = await axios.get(`${HUBSPOT_API}/crm/v3/objects/deals`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        limit,
        properties: ["dealname", "dealstage", "amount", "hubspot_owner_id"].join(
          ","
        ),
      },
      timeout: 4000,
    });
    deals = res.data?.results || [];
  } catch {
    return { without: 0, sample: 0, items: [] };
  }

  const sample = deals.length;
  if (sample === 0) return { without: 0, sample: 0, items: [] };

  let without = 0;
  const items = [];
  for (const deal of deals) {
    try {
      const assocRes = await axios.get(
        `${HUBSPOT_API}/crm/v3/objects/deals/${deal.id}/associations/contacts`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 2000,
        }
      );
      if (!assocRes.data?.results?.length) {
        without++;
        if (items.length < 10) items.push(normalizeDeal(deal));
      }
    } catch {
      /* skip */
    }
  }

  return { without, sample, items };
}

function inactiveDealFilterGroups() {
  return [
    {
      filters: [
        {
          propertyName: "hs_lastmodifieddate",
          operator: "LT",
          value: msAgo(90),
        },
      ],
    },
  ];
}

function detailItemsCap(unlocked) {
  return unlocked ? 500 : 100;
}

export async function analyzeDeals(fastify, portalId, token, options = {}) {
  const unlocked = Boolean(options.unlocked);
  const inactiveCutoffMs = msAgo(90);

  const [
    totalAll,
    noContactSearch,
    noOwner,
    noPrice,
    inactive,
  ] = await Promise.all([
    crmSearchTotal(token, "deals", filterAllRecords()),
    crmSearchTotal(token, "deals", [
      {
        filters: [
          {
            propertyName: "num_associated_contacts",
            operator: "EQ",
            value: "0",
          },
        ],
      },
    ]),
    crmSearchTotal(token, "deals", [
      {
        filters: [
          { propertyName: "hubspot_owner_id", operator: "NOT_HAS_PROPERTY" },
        ],
      },
    ]),
    crmSearchTotal(token, "deals", [
      {
        filters: [{ propertyName: "amount", operator: "NOT_HAS_PROPERTY" }],
      },
      {
        filters: [{ propertyName: "amount", operator: "EQ", value: "0" }],
      },
    ]),
    crmSearchTotal(token, "deals", [
      {
        filters: [
          {
            propertyName: "hs_lastmodifieddate",
            operator: "LT",
            value: inactiveCutoffMs,
          },
        ],
      },
    ]),
  ]);

  const searchCoreFailed =
    totalAll == null ||
    noOwner == null ||
    noPrice == null ||
    inactive == null;

  if (searchCoreFailed) {
    fastify.log.warn(
      { portalId },
      "Deals: CRM Search unavailable, using legacy sample analysis"
    );
    return analyzeDealsLegacy(fastify, portalId, token, { unlocked });
  }

  let withoutContactCount = noContactSearch;
  let contactMetricLimited = false;

  if (withoutContactCount == null) {
    const assoc = await countDealsWithoutContactAssociationSample(token, 25);
    contactMetricLimited = true;
    const t = totalAll || 1;
    withoutContactCount =
      assoc.sample > 0
        ? Math.round((assoc.without / assoc.sample) * t)
        : 0;
  }

  const totalDeals = totalAll;

  if (totalDeals === 0) {
    return {
      total: 0,
      withoutContact: {
        count: 0,
        percentage: 0,
        score: 100,
        items: [],
      },
      withoutOwner: {
        count: 0,
        percentage: 0,
        score: 100,
        items: [],
      },
      withoutPrice: {
        count: 0,
        percentage: 0,
        score: 100,
        items: [],
      },
      inactive: {
        count: 0,
        percentage: 0,
        score: 100,
        items: [],
      },
      stagesSummary: [],
      averageActivities: 0,
      limitedVisibility: false,
      countsSource: "crm_search",
    };
  }

  const withoutOwnerCount = noOwner;
  const withoutPriceCount = noPrice;
  const inactiveCount = inactive;

  const withoutContactPercentage = Number(
    ((withoutContactCount / totalDeals) * 100).toFixed(1)
  );
  const withoutOwnerPercentage = Number(
    ((withoutOwnerCount / totalDeals) * 100).toFixed(1)
  );
  const withoutPricePercentage = Number(
    ((withoutPriceCount / totalDeals) * 100).toFixed(1)
  );
  const inactivePercentage = Number(
    ((inactiveCount / totalDeals) * 100).toFixed(1)
  );

  let stagesSummary = [];
  try {
    const res = await axios.get(`${HUBSPOT_API}/crm/v3/objects/deals`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        limit: 100,
        properties: "dealstage",
      },
      timeout: 4000,
    });
    const batch = res.data?.results || [];
    const stages = {};
    batch.forEach((d) => {
      const stage = d.properties?.dealstage || "Sin etapa";
      stages[stage] = (stages[stage] || 0) + 1;
    });
    const ref = batch.length || 1;
    stagesSummary = Object.entries(stages).map(([stage, count]) => ({
      stage,
      count,
      percentage: Number(((count / ref) * 100).toFixed(1)),
    }));
  } catch {
    stagesSummary = [];
  }

  const cap = detailItemsCap(unlocked);
  const inactiveRaw = await crmSearchFetch(
    token,
    "deals",
    inactiveDealFilterGroups(),
    {
      properties: [
        "dealname",
        "dealstage",
        "amount",
        "hubspot_owner_id",
        "hs_lastmodifieddate",
      ],
      maxResults: cap,
    }
  );
  const inactiveItems = inactiveRaw.map(normalizeDeal);

  return {
    total: totalDeals,
    withoutContact: {
      count: withoutContactCount,
      percentage: withoutContactPercentage,
      score: calculateScore(withoutContactPercentage),
      items: [],
    },
    withoutOwner: {
      count: withoutOwnerCount,
      percentage: withoutOwnerPercentage,
      score: calculateScore(withoutOwnerPercentage),
      items: [],
    },
    withoutPrice: {
      count: withoutPriceCount,
      percentage: withoutPricePercentage,
      score: calculateScore(withoutPricePercentage),
      items: [],
    },
    inactive: {
      count: inactiveCount,
      percentage: inactivePercentage,
      score: calculateScore(inactivePercentage),
      items: inactiveItems,
    },
    stagesSummary,
    averageActivities: 0,
    limitedVisibility: contactMetricLimited,
    countsSource: contactMetricLimited ? "crm_search_partial" : "crm_search",
  };
}

/** Análisis previo (muestra 50 + asociaciones por deal) — fallback completo. */
async function analyzeDealsLegacy(fastify, portalId, token, options = {}) {
  const unlocked = Boolean(options.unlocked);
  const listLimit = unlocked ? 200 : 50;
  let deals = [];
  let limitedVisibility = false;

  try {
    const res = await axios.get(`${HUBSPOT_API}/crm/v3/objects/deals`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        limit: listLimit,
        properties: [
          "dealname",
          "dealstage",
          "amount",
          "hubspot_owner_id",
          "hs_lastmodifieddate",
          "closedate",
          "pipeline",
        ].join(","),
      },
      timeout: 2500,
    });
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
        items: [],
      },
      withoutOwner: {
        count: 0,
        percentage: 0,
        score: 100,
        items: [],
      },
      withoutPrice: {
        count: 0,
        percentage: 0,
        score: 100,
        items: [],
      },
      inactive: {
        count: 0,
        percentage: 0,
        score: 100,
        items: [],
      },
      stagesSummary: [],
      averageActivities: 0,
      limitedVisibility,
      countsSource: "sample",
    };
  }

  const dealsWithoutContact = [];
  for (const deal of deals) {
    try {
      const assocRes = await axios.get(
        `${HUBSPOT_API}/crm/v3/objects/deals/${deal.id}/associations/contacts`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 2500,
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

  const dealsWithoutOwner = deals
    .filter((d) => !d.properties?.hubspot_owner_id)
    .map(normalizeDeal);
  const withoutOwnerCount = dealsWithoutOwner.length;
  const withoutOwnerPercentage = Number(
    ((withoutOwnerCount / totalDeals) * 100).toFixed(1)
  );

  const dealsWithoutPrice = deals
    .filter((d) => !d.properties?.amount || Number(d.properties.amount) === 0)
    .map(normalizeDeal);
  const withoutPriceCount = dealsWithoutPrice.length;
  const withoutPricePercentage = Number(
    ((withoutPriceCount / totalDeals) * 100).toFixed(1)
  );

  const threeMonthsAgo = Date.now() - THREE_MONTHS;
  const inactiveDeals = deals
    .filter((d) => {
      const lastMod = d.properties?.hs_lastmodifieddate;
      if (!lastMod) return false;
      return new Date(lastMod).getTime() < threeMonthsAgo;
    })
    .map(normalizeDeal);
  const inactiveCount = inactiveDeals.length;
  const inactivePercentage = Number(
    ((inactiveCount / totalDeals) * 100).toFixed(1)
  );

  const stagesSummary = {};
  deals.forEach((d) => {
    const stage = d.properties?.dealstage || "Sin etapa";
    stagesSummary[stage] = (stagesSummary[stage] || 0) + 1;
  });
  const stagesArray = Object.entries(stagesSummary).map(([stage, count]) => ({
    stage,
    count,
    percentage: Number(((count / totalDeals) * 100).toFixed(1)),
  }));

  return {
    total: totalDeals,
    withoutContact: {
      count: withoutContactCount,
      percentage: withoutContactPercentage,
      score: calculateScore(withoutContactPercentage),
      items: dealsWithoutContact,
    },
    withoutOwner: {
      count: withoutOwnerCount,
      percentage: withoutOwnerPercentage,
      score: calculateScore(withoutOwnerPercentage),
      items: dealsWithoutOwner,
    },
    withoutPrice: {
      count: withoutPriceCount,
      percentage: withoutPricePercentage,
      score: calculateScore(withoutPricePercentage),
      items: dealsWithoutPrice,
    },
    inactive: {
      count: inactiveCount,
      percentage: inactivePercentage,
      score: calculateScore(inactivePercentage),
      items: inactiveDeals,
    },
    stagesSummary: stagesArray,
    averageActivities: 0,
    limitedVisibility,
    countsSource: "sample",
  };
}
