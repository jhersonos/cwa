import { hubspotRequest } from "./hubspotRequest.js";

/**
 * Fetch all contacts with pagination
 * SOLO fetch, nada de scoring
 */
export async function fetchAllContacts(fastify, portalId, token) {
  let after;
  const contacts = [];

  do {
    const res = await hubspotRequest(
      fastify,
      portalId,
      token,
      `/crm/v3/objects/contacts?limit=100&properties=email,lifecyclestage,hs_lastmodifieddate`
    );

    if (res?.results?.length) {
      contacts.push(...res.results);
    }

    after = res?.paging?.next?.after;
  } while (after);

  return contacts;
}
