/**
 * Conteos globales vía CRM Search API (campo `total` en la respuesta).
 * 1 POST por métrica — sin paginar todo el objeto.
 * @see https://developers.hubspot.com/docs/api/crm/search
 */
import axios from "axios";

const HUBSPOT_API = "https://api.hubapi.com";

/**
 * @param {string} token
 * @param {"contacts"|"companies"|"deals"} objectType
 * @param {Array<{filters: Array<Record<string, unknown>>}>} filterGroups
 * @returns {Promise<number|null>} total o null si error (p. ej. 403 / propiedad no indexada)
 */
export async function crmSearchTotal(token, objectType, filterGroups) {
  try {
    const res = await axios.post(
      `${HUBSPOT_API}/crm/v3/objects/${objectType}/search`,
      {
        filterGroups,
        limit: 1,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );
    const t = res.data?.total;
    return typeof t === "number" ? t : 0;
  } catch {
    return null;
  }
}

/** Filtro “todos los registros” (hs_object_id existe y es > 0). */
export function filterAllRecords() {
  return [
    {
      filters: [
        {
          propertyName: "hs_object_id",
          operator: "GT",
          value: "0",
        },
      ],
    },
  ];
}

export function msAgo(days) {
  return String(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Lista registros vía CRM Search (paginado) para vistas de detalle / export.
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function crmSearchFetch(
  token,
  objectType,
  filterGroups,
  { properties = [], maxResults = 100 } = {}
) {
  const out = [];
  let after;

  try {
    while (out.length < maxResults) {
      const limit = Math.min(100, maxResults - out.length);
      const body = { filterGroups, limit };
      if (properties.length) body.properties = properties;
      if (after) body.after = after;

      const res = await axios.post(
        `${HUBSPOT_API}/crm/v3/objects/${objectType}/search`,
        body,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 20000,
        }
      );

      const batch = res.data?.results || [];
      out.push(...batch);
      after = res.data?.paging?.next?.after;
      if (!after || batch.length === 0) break;
    }
  } catch {
    return [];
  }

  return out;
}
