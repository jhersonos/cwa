// src/services/analysis/companies.analysis.js
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

function normalizeCompany(company) {
  const props = company.properties || {};

  return {
    id: company.id,
    name: props.name || `Company ${company.id}`,
    domain: props.domain || null,
    owner: props.hubspot_owner_id || null,
    lastModified: props.hs_lastmodifieddate || null
  };
}

/* ----------------------------------
   MAIN ANALYSIS FUNCTION
---------------------------------- */

export async function analyzeCompanies(fastify, portalId, token) {
  let companies = [];
  let limitedVisibility = false;

  try {
    const res = await axios.get(
      `${HUBSPOT_API}/crm/v3/objects/companies`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          limit: 100,
          properties: [
            "name",
            "domain",
            "hubspot_owner_id",
            "hs_lastmodifieddate",
            "phone",
            "industry"
          ].join(",")
        },
        timeout: 8000
      }
    );

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
        items: []
      },
      withoutOwner: {
        count: 0,
        percentage: 0,
        score: 100,
        items: []
      },
      withoutPhone: {
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
      limitedVisibility
    };
  }

  /* ----------------------------------
     EMPRESAS SIN DOMINIO
  ---------------------------------- */

  const companiesWithoutDomain = companies
    .filter(c => !c.properties?.domain)
    .map(normalizeCompany);

  const withoutDomainCount = companiesWithoutDomain.length;
  const withoutDomainPercentage = Number(
    ((withoutDomainCount / totalCompanies) * 100).toFixed(1)
  );

  /* ----------------------------------
     EMPRESAS SIN OWNER
  ---------------------------------- */

  const companiesWithoutOwner = companies
    .filter(c => !c.properties?.hubspot_owner_id)
    .map(normalizeCompany);

  const withoutOwnerCount = companiesWithoutOwner.length;
  const withoutOwnerPercentage = Number(
    ((withoutOwnerCount / totalCompanies) * 100).toFixed(1)
  );

  /* ----------------------------------
     EMPRESAS SIN TELÉFONO
  ---------------------------------- */

  const companiesWithoutPhone = companies
    .filter(c => !c.properties?.phone)
    .map(normalizeCompany);

  const withoutPhoneCount = companiesWithoutPhone.length;
  const withoutPhonePercentage = Number(
    ((withoutPhoneCount / totalCompanies) * 100).toFixed(1)
  );

  /* ----------------------------------
     EMPRESAS INACTIVAS (3 MESES)
  ---------------------------------- */

  const threeMonthsAgo = Date.now() - THREE_MONTHS;
  const inactiveCompanies = companies
    .filter(c => {
      const lastMod = c.properties?.hs_lastmodifieddate;
      if (!lastMod) return false;
      return new Date(lastMod).getTime() < threeMonthsAgo;
    })
    .map(normalizeCompany);

  const inactiveCount = inactiveCompanies.length;
  const inactivePercentage = Number(
    ((inactiveCount / totalCompanies) * 100).toFixed(1)
  );

  /* ----------------------------------
     PROMEDIO DE ACTIVIDADES POR COMPANY
  ---------------------------------- */

  let totalActivities = 0;
  let companiesWithActivities = 0;

  // Fetch actividades para una muestra de companies (primeros 20)
  const sampleSize = Math.min(20, totalCompanies);
  for (let i = 0; i < sampleSize; i++) {
    try {
      const activitiesRes = await axios.get(
        `${HUBSPOT_API}/crm/v3/objects/companies/${companies[i].id}/associations/activities`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          timeout: 3000
        }
      );

      const activityCount = activitiesRes.data?.results?.length || 0;
      totalActivities += activityCount;
      companiesWithActivities++;
    } catch {
      // Ignorar errores individuales
      limitedVisibility = true;
    }
  }

  const averageActivities = companiesWithActivities > 0
    ? Number((totalActivities / companiesWithActivities).toFixed(1))
    : 0;

  /* ----------------------------------
     RESPONSE
  ---------------------------------- */

  return {
    total: totalCompanies,
    withoutDomain: {
      count: withoutDomainCount,
      percentage: withoutDomainPercentage,
      score: calculateScore(withoutDomainPercentage),
      items: companiesWithoutDomain
    },
    withoutOwner: {
      count: withoutOwnerCount,
      percentage: withoutOwnerPercentage,
      score: calculateScore(withoutOwnerPercentage),
      items: companiesWithoutOwner
    },
    withoutPhone: {
      count: withoutPhoneCount,
      percentage: withoutPhonePercentage,
      score: calculateScore(withoutPhonePercentage),
      items: companiesWithoutPhone
    },
    inactive: {
      count: inactiveCount,
      percentage: inactivePercentage,
      score: calculateScore(inactivePercentage),
      items: inactiveCompanies
    },
    averageActivities,
    limitedVisibility
  };
}

