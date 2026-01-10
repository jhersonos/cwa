// src/services/hubspot/contacts.service.js

import axios from "axios";

const HUBSPOT_API = "https://api.hubapi.com";

/**
 * Fetch a SAFE SAMPLE of contacts
 * - Nunca pagina infinito
 * - Nunca rompe por 429
 * - Nunca tarda demasiado
 */
export async function fetchAllContacts(
  fastify,
  portalId,
  token,
  options = {}
) {
  const LIMIT = options.limit || 200; // 🚀 Reducido de 500 a 200 para velocidad

  const contacts = [];
  let after = undefined;
  const MAX_PAGES = 3; // 🚀 Máximo 3 páginas (300 contactos)
  let pageCount = 0;

  try {
    while (contacts.length < LIMIT && pageCount < MAX_PAGES) {
      const remaining = LIMIT - contacts.length;
      const pageSize = Math.min(100, remaining);

      const res = await axios.get(
        `${HUBSPOT_API}/crm/v3/objects/contacts`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          params: {
            limit: pageSize,
            after,
            properties: [
              "email",
              "phone",
              "mobilephone",
              "lifecyclestage",
              "hs_lastmodifieddate",
              "firstname",
              "lastname"
            ].join(",")
          },
          timeout: 4000 // 🚀 Reducido de 8000ms a 4000ms
        }
      );

      pageCount++;

      const results = res.data?.results || [];
      contacts.push(...results);

      // 🔚 No más páginas
      if (!res.data?.paging?.next?.after) break;

      after = res.data.paging.next.after;
    }
  } catch (err) {
    const status = err?.response?.status;

    // 🚫 RATE LIMIT / PERMISOS
    if (status === 429 || status === 403 || status === 401) {
      fastify.log.warn(
        { portalId, status },
        "Contacts fetch degraded due to HubSpot limits"
      );
      return contacts; // 👈 devolver lo que haya
    }

    // 🔥 Error inesperado
    fastify.log.error(
      { err, portalId },
      "Unexpected error fetching contacts"
    );
    return contacts;
  }

  return contacts;
}
