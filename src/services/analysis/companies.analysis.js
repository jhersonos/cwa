// src/services/analysis/companies.analysis.js
import axios from "axios";
import {
  crmSearchFetch,
  crmSearchTotal,
  filterAllRecords,
  msAgo,
} from "../hubspot/crmSearchTotals.service.js";

const COMPANY_PROPERTIES = [
  "name",
  "domain",
  "hubspot_owner_id",
  "hs_lastmodifieddate",
  "phone",
  "industry",
];

function normalizeCompany(company) {
  const p = company.properties || {};
  return {
    id: company.id,
    name: p.name || `Empresa ${company.id}`,
    domain: p.domain || null,
    lastModified: p.hs_lastmodifieddate || null,
    phone: p.phone || null,
  };
}

function inactiveCompanyFilterGroups() {
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

const HUBSPOT_API = "https://api.hubapi.com";
const THREE_MONTHS = 90 * 24 * 60 * 60 * 1000;

function calculateScore(percentage) {
  if (percentage === 0) return 100;
  if (percentage <= 5) return 85;
  if (percentage <= 15) return 60;
  return 30;
}

export async function analyzeCompanies(fastify, portalId, token, options = {}) {
  const unlocked = Boolean(options.unlocked);
  const inactiveCutoffMs = msAgo(90);

  const [totalAll, noDomain, noOwner, noPhone, inactive] = await Promise.all([
    crmSearchTotal(token, "companies", filterAllRecords()),
    crmSearchTotal(token, "companies", [
      { filters: [{ propertyName: "domain", operator: "NOT_HAS_PROPERTY" }] },
    ]),
    crmSearchTotal(token, "companies", [
      {
        filters: [
          { propertyName: "hubspot_owner_id", operator: "NOT_HAS_PROPERTY" },
        ],
      },
    ]),
    crmSearchTotal(token, "companies", [
      { filters: [{ propertyName: "phone", operator: "NOT_HAS_PROPERTY" }] },
    ]),
    crmSearchTotal(token, "companies", [
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

  const searchFailed =
    totalAll == null ||
    noDomain == null ||
    noOwner == null ||
    noPhone == null ||
    inactive == null;

  if (searchFailed) {
    fastify.log.warn(
      { portalId },
      "Companies: CRM Search totals unavailable, using sample fallback"
    );
    return analyzeCompaniesSample(fastify, portalId, token, { unlocked });
  }

  const totalCompanies = totalAll;

  if (totalCompanies === 0) {
    return {
      total: 0,
      withoutDomain: {
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
      withoutPhone: {
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
      averageActivities: 0,
      limitedVisibility: false,
      countsSource: "crm_search",
    };
  }

  const withoutDomainCount = noDomain;
  const withoutOwnerCount = noOwner;
  const withoutPhoneCount = noPhone;
  const inactiveCount = inactive;

  const withoutDomainPercentage = Number(
    ((withoutDomainCount / totalCompanies) * 100).toFixed(1)
  );
  const withoutOwnerPercentage = Number(
    ((withoutOwnerCount / totalCompanies) * 100).toFixed(1)
  );
  const withoutPhonePercentage = Number(
    ((withoutPhoneCount / totalCompanies) * 100).toFixed(1)
  );
  const inactivePercentage = Number(
    ((inactiveCount / totalCompanies) * 100).toFixed(1)
  );

  const cap = detailItemsCap(unlocked);
  const inactiveRaw = await crmSearchFetch(
    token,
    "companies",
    inactiveCompanyFilterGroups(),
    { properties: COMPANY_PROPERTIES, maxResults: cap }
  );
  const inactiveItems = inactiveRaw.map(normalizeCompany);

  return {
    total: totalCompanies,
    withoutDomain: {
      count: withoutDomainCount,
      percentage: withoutDomainPercentage,
      score: calculateScore(withoutDomainPercentage),
      items: [],
    },
    withoutOwner: {
      count: withoutOwnerCount,
      percentage: withoutOwnerPercentage,
      score: calculateScore(withoutOwnerPercentage),
      items: [],
    },
    withoutPhone: {
      count: withoutPhoneCount,
      percentage: withoutPhonePercentage,
      score: calculateScore(withoutPhonePercentage),
      items: [],
    },
    inactive: {
      count: inactiveCount,
      percentage: inactivePercentage,
      score: calculateScore(inactivePercentage),
      items: inactiveItems,
    },
    averageActivities: 0,
    limitedVisibility: false,
    countsSource: "crm_search",
  };
}

async function analyzeCompaniesSample(fastify, portalId, token, options = {}) {
  const unlocked = Boolean(options.unlocked);
  const listLimit = unlocked ? 200 : 50;
  let companies = [];
  let limitedVisibility = false;

  try {
    const res = await axios.get(`${HUBSPOT_API}/crm/v3/objects/companies`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        limit: listLimit,
        properties: COMPANY_PROPERTIES.join(","),
      },
      timeout: 2500,
    });

    companies = res.data?.results || [];
  } catch (err) {
    const status = err?.response?.status;
    if (status === 401 || status === 403 || status === 429) {
      limitedVisibility = true;
      companies = [];
    } else {
      fastify.log.error(
        { err, portalId },
        "Company analysis failed unexpectedly"
      );
      limitedVisibility = true;
      companies = [];
    }
  }

  const totalCompanies = companies.length;

  if (totalCompanies === 0) {
    return {
      total: 0,
      withoutDomain: {
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
      withoutPhone: {
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
      averageActivities: 0,
      limitedVisibility,
      countsSource: "sample",
    };
  }

  const companiesWithoutDomain = companies.filter(
    (c) => !c.properties?.domain
  );
  const companiesWithoutOwner = companies.filter(
    (c) => !c.properties?.hubspot_owner_id
  );
  const companiesWithoutPhone = companies.filter(
    (c) => !c.properties?.phone
  );

  const threeMonthsAgo = Date.now() - THREE_MONTHS;
  const inactiveCompanies = companies.filter((c) => {
    const lastMod = c.properties?.hs_lastmodifieddate;
    if (!lastMod) return false;
    return new Date(lastMod).getTime() < threeMonthsAgo;
  });

  const withoutDomainCount = companiesWithoutDomain.length;
  const withoutDomainPercentage = Number(
    ((withoutDomainCount / totalCompanies) * 100).toFixed(1)
  );
  const withoutOwnerCount = companiesWithoutOwner.length;
  const withoutOwnerPercentage = Number(
    ((withoutOwnerCount / totalCompanies) * 100).toFixed(1)
  );
  const withoutPhoneCount = companiesWithoutPhone.length;
  const withoutPhonePercentage = Number(
    ((withoutPhoneCount / totalCompanies) * 100).toFixed(1)
  );
  const inactiveCount = inactiveCompanies.length;
  const inactivePercentage = Number(
    ((inactiveCount / totalCompanies) * 100).toFixed(1)
  );

  return {
    total: totalCompanies,
    withoutDomain: {
      count: withoutDomainCount,
      percentage: withoutDomainPercentage,
      score: calculateScore(withoutDomainPercentage),
      items: [],
    },
    withoutOwner: {
      count: withoutOwnerCount,
      percentage: withoutOwnerPercentage,
      score: calculateScore(withoutOwnerPercentage),
      items: [],
    },
    withoutPhone: {
      count: withoutPhoneCount,
      percentage: withoutPhonePercentage,
      score: calculateScore(withoutPhonePercentage),
      items: [],
    },
    inactive: {
      count: inactiveCount,
      percentage: inactivePercentage,
      score: calculateScore(inactivePercentage),
      items: inactiveCompanies.map(normalizeCompany),
    },
    averageActivities: 0,
    limitedVisibility,
    countsSource: "sample",
  };
}
