/**
 * Vista previa (máx. N registros) por listId, alineada con las definiciones de /api/lists/create
 */

import axios from "axios";

const HUBSPOT_API = "https://api.hubapi.com";

const LIST_NAMES = {
  "contacts-without-email": "[CWA] Contactos sin email",
  "contacts-without-phone": "[CWA] Contactos sin teléfono",
  "contacts-without-owner": "[CWA] Contactos sin owner",
  "contacts-inactive-180": "[CWA] Contactos inactivos +180 días",
  "contacts-created-90-no-activity": "[CWA] Contactos creados +90d sin actividad",
  "contacts-high-risk": "[CWA] Contactos de alto riesgo",
  "deals-without-contact": "[CWA] Deals sin contacto",
  "deals-without-amount": "[CWA] Deals sin monto",
  "deals-without-owner": "[CWA] Deals sin owner",
  "deals-inactive-180": "[CWA] Deals inactivos +180 días",
  "deals-stuck-stage": "[CWA] Deals abiertos sin actividad reciente (+30 días)",
  "deals-high-risk": "[CWA] Deals de alto riesgo",
};

async function fetchContactsUpTo(token, properties, filterFn, limit) {
  const out = [];
  let after = null;
  let hasMore = true;
  const pageLimit = 100;

  while (hasMore && out.length < limit) {
    const params = {
      limit: pageLimit,
      properties: properties.join(","),
    };
    if (after) params.after = after;

    const res = await axios.get(`${HUBSPOT_API}/crm/v3/objects/contacts`, {
      headers: { Authorization: `Bearer ${token}` },
      params,
      timeout: 20000,
    });

    const results = res.data?.results || [];
    const filtered = filterFn ? results.filter(filterFn) : results;
    for (const r of filtered) {
      if (out.length >= limit) break;
      out.push(r);
    }
    after = res.data?.paging?.next?.after;
    hasMore = !!after && out.length < limit;
  }
  return out;
}

async function fetchDealsUpTo(token, properties, filterFn, limit) {
  const out = [];
  let after = null;
  let hasMore = true;
  const pageLimit = 100;

  while (hasMore && out.length < limit) {
    const params = {
      limit: pageLimit,
      properties: properties.join(","),
    };
    if (after) params.after = after;

    const res = await axios.get(`${HUBSPOT_API}/crm/v3/objects/deals`, {
      headers: { Authorization: `Bearer ${token}` },
      params,
      timeout: 20000,
    });

    const results = res.data?.results || [];
    const filtered = filterFn ? results.filter(filterFn) : results;
    for (const r of filtered) {
      if (out.length >= limit) break;
      out.push(r);
    }
    after = res.data?.paging?.next?.after;
    hasMore = !!after && out.length < limit;
  }
  return out;
}

async function fetchDealsWithoutContactSample(token, portalId, limit) {
  const out = [];
  let after = null;
  let hasMore = true;

  while (hasMore && out.length < limit) {
    const params = {
      limit: 50,
      properties: ["dealname", "dealstage", "amount", "closedate", "createdate"].join(","),
    };
    if (after) params.after = after;

    const res = await axios.get(`${HUBSPOT_API}/crm/v3/objects/deals`, {
      headers: { Authorization: `Bearer ${token}` },
      params,
      timeout: 20000,
    });

    const deals = res.data?.results || [];
    for (const deal of deals) {
      if (out.length >= limit) break;
      try {
        const assocRes = await axios.get(
          `${HUBSPOT_API}/crm/v3/objects/deals/${deal.id}/associations/contacts`,
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 8000,
          }
        );
        const hasContacts = assocRes.data?.results?.length > 0;
        if (!hasContacts) out.push(deal);
      } catch {
        out.push(deal);
      }
    }
    after = res.data?.paging?.next?.after;
    hasMore = !!after && out.length < limit;
  }
  return out;
}

function contactRow(portalId, c) {
  const p = c.properties || {};
  return {
    id: c.id,
    name: `${p.firstname || ""} ${p.lastname || ""}`.trim() || "(sin nombre)",
    email: p.email || "—",
    phone: p.phone || p.mobilephone || "—",
    extra: p.lifecyclestage || "—",
    url: `https://app.hubspot.com/contacts/${portalId}/contact/${c.id}`,
  };
}

function dealRow(portalId, d) {
  const p = d.properties || {};
  return {
    id: d.id,
    name: p.dealname || "(sin nombre)",
    stage: p.dealstage || "—",
    amount: p.amount || "—",
    extra: p.notes_last_updated || "—",
    url: `https://app.hubspot.com/contacts/${portalId}/deal/${d.id}`,
  };
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {string} portalId
 * @param {string} listId
 * @param {string} token
 * @param {number} limit
 */
export async function getListPreview(fastify, portalId, listId, token, limit = 10) {
  const listName = LIST_NAMES[listId];
  if (!listName) {
    const err = new Error("listId no reconocido");
    err.statusCode = 400;
    throw err;
  }

  const L = Math.min(Math.max(1, limit), 10);
  let columns;
  let rows;

  switch (listId) {
    case "contacts-without-email": {
      const raw = await fetchContactsUpTo(
        token,
        ["email", "firstname", "lastname", "phone", "mobilephone", "lifecyclestage", "createdate"],
        (c) => !c.properties?.email,
        L
      );
      columns = [
        { key: "name", label: "Nombre" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Teléfono" },
        { key: "extra", label: "Lifecycle" },
      ];
      rows = raw.map((c) => contactRow(portalId, c));
      break;
    }
    case "contacts-without-phone": {
      const raw = await fetchContactsUpTo(
        token,
        ["email", "firstname", "lastname", "phone", "mobilephone", "lifecyclestage"],
        (c) => !(c.properties || {}).phone,
        L
      );
      columns = [
        { key: "name", label: "Nombre" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Teléfono" },
      ];
      rows = raw.map((c) => contactRow(portalId, c));
      break;
    }
    case "contacts-without-owner": {
      const raw = await fetchContactsUpTo(
        token,
        ["hubspot_owner_id", "email", "firstname", "lastname", "lifecyclestage"],
        (c) => !c.properties?.hubspot_owner_id,
        L
      );
      columns = [
        { key: "name", label: "Nombre" },
        { key: "email", label: "Email" },
        { key: "extra", label: "Lifecycle" },
      ];
      rows = raw.map((c) => contactRow(portalId, c));
      break;
    }
    case "contacts-inactive-180": {
      const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
      const raw = await fetchContactsUpTo(
        token,
        ["notes_last_updated", "email", "firstname", "lastname", "lifecyclestage"],
        (c) => {
          const d = c.properties?.notes_last_updated;
          if (!d) return false;
          return new Date(d).getTime() < cutoff;
        },
        L
      );
      columns = [
        { key: "name", label: "Nombre" },
        { key: "email", label: "Email" },
        { key: "extra", label: "Últ. notas" },
      ];
      rows = raw.map((c) => {
        const r = contactRow(portalId, c);
        r.extra = c.properties?.notes_last_updated || "—";
        return r;
      });
      break;
    }
    case "contacts-created-90-no-activity": {
      const cutoff90 = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const raw = await fetchContactsUpTo(
        token,
        ["createdate", "notes_last_updated", "email", "firstname", "lastname"],
        (c) => {
          const p = c.properties || {};
          const created = p.createdate;
          if (!created || new Date(created).getTime() >= cutoff90) return false;
          return !p.notes_last_updated;
        },
        L
      );
      columns = [
        { key: "name", label: "Nombre" },
        { key: "email", label: "Email" },
        { key: "extra", label: "Creado" },
      ];
      rows = raw.map((c) => {
        const r = contactRow(portalId, c);
        r.extra = c.properties?.createdate || "—";
        return r;
      });
      break;
    }
    case "contacts-high-risk": {
      const raw = await fetchContactsUpTo(
        token,
        ["email", "hubspot_owner_id", "firstname", "lastname", "lifecyclestage"],
        (c) => {
          const p = c.properties || {};
          return !p.email && !p.hubspot_owner_id;
        },
        L
      );
      columns = [
        { key: "name", label: "Nombre" },
        { key: "email", label: "Email" },
        { key: "extra", label: "Lifecycle" },
      ];
      rows = raw.map((c) => contactRow(portalId, c));
      break;
    }
    case "deals-without-contact": {
      const raw = await fetchDealsWithoutContactSample(token, portalId, L);
      columns = [
        { key: "name", label: "Deal" },
        { key: "stage", label: "Etapa" },
        { key: "amount", label: "Monto" },
      ];
      rows = raw.map((d) => dealRow(portalId, d));
      break;
    }
    case "deals-without-amount": {
      const raw = await fetchDealsUpTo(
        token,
        ["dealname", "dealstage", "amount", "hubspot_owner_id", "closedate"],
        (d) => !d.properties?.amount,
        L
      );
      columns = [
        { key: "name", label: "Deal" },
        { key: "stage", label: "Etapa" },
        { key: "amount", label: "Monto" },
      ];
      rows = raw.map((d) => dealRow(portalId, d));
      break;
    }
    case "deals-without-owner": {
      const raw = await fetchDealsUpTo(
        token,
        ["dealname", "dealstage", "amount", "hubspot_owner_id"],
        (d) => !d.properties?.hubspot_owner_id,
        L
      );
      columns = [
        { key: "name", label: "Deal" },
        { key: "stage", label: "Etapa" },
        { key: "amount", label: "Monto" },
      ];
      rows = raw.map((d) => dealRow(portalId, d));
      break;
    }
    case "deals-inactive-180": {
      const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
      const raw = await fetchDealsUpTo(
        token,
        ["dealname", "dealstage", "amount", "notes_last_updated"],
        (d) => {
          const n = d.properties?.notes_last_updated;
          if (!n) return false;
          return new Date(n).getTime() < cutoff;
        },
        L
      );
      columns = [
        { key: "name", label: "Deal" },
        { key: "stage", label: "Etapa" },
        { key: "extra", label: "Última nota" },
      ];
      rows = raw.map((d) => {
        const r = dealRow(portalId, d);
        r.extra = d.properties?.notes_last_updated || "—";
        return r;
      });
      break;
    }
    case "deals-stuck-stage": {
      const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const raw = await fetchDealsUpTo(
        token,
        ["dealname", "dealstage", "amount", "closedate", "notes_last_updated"],
        (d) => {
          const p = d.properties || {};
          if (p.closedate) return false;
          const n = p.notes_last_updated;
          if (!n) return false;
          return new Date(n).getTime() < cutoff30;
        },
        L
      );
      columns = [
        { key: "name", label: "Deal" },
        { key: "stage", label: "Etapa" },
        { key: "extra", label: "Últ. notas" },
      ];
      rows = raw.map((d) => {
        const r = dealRow(portalId, d);
        r.extra = d.properties?.notes_last_updated || "—";
        return r;
      });
      break;
    }
    case "deals-high-risk": {
      const raw = await fetchDealsUpTo(
        token,
        ["dealname", "dealstage", "amount", "hubspot_owner_id"],
        (d) => {
          const p = d.properties || {};
          return !p.amount && !p.hubspot_owner_id;
        },
        L
      );
      columns = [
        { key: "name", label: "Deal" },
        { key: "stage", label: "Etapa" },
        { key: "amount", label: "Monto" },
      ];
      rows = raw.map((d) => dealRow(portalId, d));
      break;
    }
    default: {
      const err = new Error("listId no soportado");
      err.statusCode = 400;
      throw err;
    }
  }

  return {
    listId,
    listName,
    portalId,
    previewLimit: L,
    columns,
    rows,
  };
}
