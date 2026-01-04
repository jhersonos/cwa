import { fetchAllContacts } from "../../hubspot/contacts.service.js";

const MAX_SAMPLE = 500;

function buildContactItem(portalId, contact) {
  const p = contact.properties || {};

  return {
    id: contact.id,
    name: `${p.firstname || ""} ${p.lastname || ""}`.trim() || "Unnamed contact",
    email: p.email || null,
    hubspotUrl: `https://app.hubspot.com/contacts/${portalId}/record/0-1/${contact.id}`
  };
}

export async function getContactsWithoutEmail({ portalId, token }) {
    let contacts = [];
  
    try {
      contacts = await fetchAllContacts(null, portalId, token, {
        limit: MAX_SAMPLE
      });
  
      if (!Array.isArray(contacts)) {
        contacts = [];
      }
    } catch (err) {
      // degradar silenciosamente (detalle nunca rompe la app)
      contacts = [];
    }
  
    const filtered = contacts.filter(c => !c.properties?.email);
  
    return {
      type: "contacts-without-email",
      total: filtered.length,
      items: filtered.map(c => buildContactItem(portalId, c))
    };
  }

export async function getContactsWithoutLifecycle(server, portalId, token) {
  const contacts = await fetchAllContacts(server, portalId, token, {
    limit: MAX_SAMPLE
  });

  return contacts
    .filter(c => !c.properties?.lifecyclestage)
    .map(c => buildContactItem(portalId, c));
}

export async function getStaleContacts(server, portalId, token) {
  const twelveMonthsAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;

  const contacts = await fetchAllContacts(server, portalId, token, {
    limit: MAX_SAMPLE
  });

  return contacts
    .filter(c => {
      const last = c.properties?.hs_lastmodifieddate;
      return last && new Date(last).getTime() < twelveMonthsAgo;
    })
    .map(c => buildContactItem(portalId, c));
}
