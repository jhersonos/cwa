/**
 * EXPORT SERVICE
 * Genera exportaciones XLSX de auditoría completa
 */

import axios from "axios";
import XLSX from "xlsx";

const HUBSPOT_API = "https://api.hubapi.com";

/**
 * Fetch con paginación para traer TODOS los registros
 */
async function fetchAllRecords(endpoint, token, properties, filterFn = null) {
  const allRecords = [];
  let after = null;
  let hasMore = true;
  const limit = 100;
  
  while (hasMore && allRecords.length < 10000) { // Límite de seguridad: 10k registros
    try {
      const params = {
        limit,
        properties: properties.join(",")
      };
      
      if (after) {
        params.after = after;
      }
      
      const res = await axios.get(`${HUBSPOT_API}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
        timeout: 10000
      });
      
      const results = res.data?.results || [];
      
      // Aplicar filtro si existe
      const filtered = filterFn ? results.filter(filterFn) : results;
      allRecords.push(...filtered);
      
      // Verificar si hay más páginas
      after = res.data?.paging?.next?.after;
      hasMore = !!after;
      
    } catch (error) {
      console.error(`Error fetching ${endpoint}:`, error.message);
      break;
    }
  }
  
  return allRecords;
}

/**
 * Genera XLSX completo de resumen de auditoría
 */
export async function generateAuditSummaryXLSX(scanData, portalId) {
  const { efficiency, contacts, users, deals, companies, insights, trafficLights } = scanData;
  
  // Hoja 1: Resumen General
  const summaryData = [
    ["Cost CRM Risk Scanner - Resumen de Auditoría Completa"],
    ["Fecha del análisis", new Date().toISOString().split('T')[0]],
    ["Portal ID", portalId],
    [],
    ["PUNTUACIÓN GLOBAL"],
    ["Score de eficiencia", `${efficiency.score}/100`],
    ["Nivel", efficiency.level],
    [],
    ["PUNTUACIÓN POR OBJETO"],
  ];
  
  if (trafficLights.contacts) {
    summaryData.push(["Contactos", `${trafficLights.contacts.score}/100`, trafficLights.contacts.label]);
  }
  if (trafficLights.deals) {
    summaryData.push(["Deals", `${trafficLights.deals.score}/100`, trafficLights.deals.label]);
  }
  if (trafficLights.companies) {
    summaryData.push(["Empresas", `${trafficLights.companies.score}/100`, trafficLights.companies.label]);
  }
  if (trafficLights.users) {
    summaryData.push(["Usuarios", `${trafficLights.users.score}/100`, trafficLights.users.label]);
  }
  
  summaryData.push([]);
  summaryData.push(["INSTANTÁNEA DIAGNÓSTICA"]);
  summaryData.push(["Contactos analizados", contacts.total]);
  summaryData.push(["Contactos sin email", contacts.withoutEmail]);
  summaryData.push(["Contactos sin teléfono", contacts.withoutPhone]);
  summaryData.push(["Contactos sin lifecycle", contacts.withoutLifecycle]);
  summaryData.push(["Contactos obsoletos", contacts.stale]);
  summaryData.push([]);
  
  if (deals && deals.total > 0) {
    summaryData.push(["Deals analizados", deals.total]);
    summaryData.push(["Deals sin contacto", `${deals.withoutContact.count} (${deals.withoutContact.percentage}%)`]);
    summaryData.push(["Deals sin owner", `${deals.withoutOwner.count} (${deals.withoutOwner.percentage}%)`]);
    summaryData.push(["Deals sin precio", `${deals.withoutPrice.count} (${deals.withoutPrice.percentage}%)`]);
    summaryData.push(["Deals inactivos", `${deals.inactive.count} (${deals.inactive.percentage}%)`]);
    summaryData.push([]);
  }
  
  if (companies && companies.total > 0) {
    summaryData.push(["Empresas analizadas", companies.total]);
    summaryData.push(["Empresas sin dominio", `${companies.withoutDomain.count} (${companies.withoutDomain.percentage}%)`]);
    summaryData.push(["Empresas sin owner", `${companies.withoutOwner.count} (${companies.withoutOwner.percentage}%)`]);
    summaryData.push(["Empresas sin teléfono", `${companies.withoutPhone.count} (${companies.withoutPhone.percentage}%)`]);
    summaryData.push(["Empresas inactivas", `${companies.inactive.count} (${companies.inactive.percentage}%)`]);
    summaryData.push([]);
  }
  
  // Hoja 2: Insights Críticos
  const insightsData = [
    ["Título", "Severidad", "Urgencia", "Impacto en Negocio", "Recomendación"]
  ];
  
  const criticalInsights = insights.filter(i => i.severity === 'critical');
  if (criticalInsights.length > 0) {
    criticalInsights.forEach(insight => {
      insightsData.push([
        insight.title,
        insight.severity.toUpperCase(),
        insight.urgency,
        insight.businessImpact,
        insight.recommendation
      ]);
    });
  } else {
    insightsData.push(["No se detectaron insights críticos", "", "", "", ""]);
  }
  
  // Crear workbook
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  const ws2 = XLSX.utils.aoa_to_sheet(insightsData);
  
  XLSX.utils.book_append_sheet(wb, ws1, "Resumen");
  XLSX.utils.book_append_sheet(wb, ws2, "Insights Críticos");
  
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Genera XLSX de deals sin owner
 */
export async function generateDealsWithoutOwnerXLSX(fastify, portalId, token) {
  try {
    fastify.log.info({ portalId }, "Fetching all deals without owner");
    
    const allDeals = await fetchAllRecords(
      '/crm/v3/objects/deals',
      token,
      ["dealname", "dealstage", "amount", "hubspot_owner_id", "closedate", "createdate"],
      (deal) => !deal.properties.hubspot_owner_id // Filtrar solo deals sin owner
    );
    
    fastify.log.info({ portalId, count: allDeals.length }, "Deals without owner fetched");
    
    // Preparar datos para Excel
    const data = [
      ["Deal Name", "Deal Stage", "Amount", "Close Date", "Created Date", "Deal ID", "URL"]
    ];
    
    allDeals.forEach(deal => {
      const p = deal.properties;
      const dealUrl = `https://app.hubspot.com/contacts/${portalId}/deal/${deal.id}`;
      
      data.push([
        p.dealname || 'Sin nombre',
        p.dealstage || 'Sin etapa',
        p.amount || '',
        p.closedate || '',
        p.createdate || '',
        deal.id,
        dealUrl
      ]);
    });
    
    // Crear workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Autoajustar anchos de columna
    ws['!cols'] = [
      { wch: 30 }, // Deal Name
      { wch: 20 }, // Deal Stage
      { wch: 15 }, // Amount
      { wch: 15 }, // Close Date
      { wch: 15 }, // Created Date
      { wch: 15 }, // Deal ID
      { wch: 50 }  // URL
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, "Deals sin Owner");
    
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  } catch (error) {
    fastify.log.error({ err: error, portalId }, "Error generating deals without owner XLSX");
    throw error;
  }
}

/**
 * Genera XLSX de deals sin contacto
 */
export async function generateDealsWithoutContactXLSX(fastify, portalId, token) {
  try {
    fastify.log.info({ portalId }, "Fetching all deals and checking contacts");
    
    // Traer todos los deals
    const allDeals = await fetchAllRecords(
      '/crm/v3/objects/deals',
      token,
      ["dealname", "dealstage", "amount", "closedate", "createdate"]
    );
    
    // Verificar cuáles tienen contacto asociado
    const dealsWithoutContact = [];
    
    for (const deal of allDeals.slice(0, 1000)) { // Limitar a 1000 para no saturar API
      try {
        const assocRes = await axios.get(
          `${HUBSPOT_API}/crm/v3/objects/deals/${deal.id}/associations/contacts`,
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 5000
          }
        );
        
        const hasContacts = assocRes.data?.results?.length > 0;
        if (!hasContacts) {
          dealsWithoutContact.push(deal);
        }
      } catch (err) {
        // Si falla, asumir que no tiene contacto
        dealsWithoutContact.push(deal);
      }
    }
    
    fastify.log.info({ portalId, count: dealsWithoutContact.length }, "Deals without contact found");
    
    // Preparar datos para Excel
    const data = [
      ["Deal Name", "Deal Stage", "Amount", "Close Date", "Created Date", "Deal ID", "URL"]
    ];
    
    dealsWithoutContact.forEach(deal => {
      const p = deal.properties;
      const dealUrl = `https://app.hubspot.com/contacts/${portalId}/deal/${deal.id}`;
      
      data.push([
        p.dealname || 'Sin nombre',
        p.dealstage || 'Sin etapa',
        p.amount || '',
        p.closedate || '',
        p.createdate || '',
        deal.id,
        dealUrl
      ]);
    });
    
    // Crear workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    ws['!cols'] = [
      { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 50 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, "Deals sin Contacto");
    
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  } catch (error) {
    fastify.log.error({ err: error, portalId }, "Error generating deals without contact XLSX");
    throw error;
  }
}

/**
 * Genera XLSX de deals sin amount
 */
export async function generateDealsWithoutAmountXLSX(fastify, portalId, token) {
  try {
    fastify.log.info({ portalId }, "Fetching all deals without amount");
    
    const allDeals = await fetchAllRecords(
      '/crm/v3/objects/deals',
      token,
      ["dealname", "dealstage", "amount", "hubspot_owner_id", "closedate", "createdate"],
      (deal) => !deal.properties.amount // Filtrar solo deals sin amount
    );
    
    fastify.log.info({ portalId, count: allDeals.length }, "Deals without amount fetched");
    
    // Preparar datos para Excel
    const data = [
      ["Deal Name", "Deal Stage", "Owner ID", "Close Date", "Created Date", "Deal ID", "URL"]
    ];
    
    allDeals.forEach(deal => {
      const p = deal.properties;
      const dealUrl = `https://app.hubspot.com/contacts/${portalId}/deal/${deal.id}`;
      
      data.push([
        p.dealname || 'Sin nombre',
        p.dealstage || 'Sin etapa',
        p.hubspot_owner_id || 'Sin owner',
        p.closedate || '',
        p.createdate || '',
        deal.id,
        dealUrl
      ]);
    });
    
    // Crear workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    ws['!cols'] = [
      { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 50 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, "Deals sin Precio");
    
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  } catch (error) {
    fastify.log.error({ err: error, portalId }, "Error generating deals without amount XLSX");
    throw error;
  }
}

/**
 * Genera XLSX de contactos sin email
 */
export async function generateContactsWithoutEmailXLSX(fastify, portalId, token) {
  try {
    fastify.log.info({ portalId }, "Fetching all contacts without email");
    
    const allContacts = await fetchAllRecords(
      '/crm/v3/objects/contacts',
      token,
      ["email", "firstname", "lastname", "phone", "mobilephone", "lifecyclestage", "createdate"],
      (contact) => !contact.properties.email // Filtrar solo contactos sin email
    );
    
    fastify.log.info({ portalId, count: allContacts.length }, "Contacts without email fetched");
    
    // Preparar datos para Excel
    const data = [
      ["First Name", "Last Name", "Phone", "Mobile", "Lifecycle Stage", "Created Date", "Contact ID", "URL"]
    ];
    
    allContacts.forEach(contact => {
      const p = contact.properties;
      const contactUrl = `https://app.hubspot.com/contacts/${portalId}/contact/${contact.id}`;
      
      data.push([
        p.firstname || '',
        p.lastname || '',
        p.phone || '',
        p.mobilephone || '',
        p.lifecyclestage || 'Sin lifecycle',
        p.createdate || '',
        contact.id,
        contactUrl
      ]);
    });
    
    // Crear workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    ws['!cols'] = [
      { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 50 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, "Contactos sin Email");
    
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  } catch (error) {
    fastify.log.error({ err: error, portalId }, "Error generating contacts without email XLSX");
    throw error;
  }
}

/**
 * Genera XLSX de empresas sin teléfono
 */
export async function generateCompaniesWithoutPhoneXLSX(fastify, portalId, token) {
  try {
    fastify.log.info({ portalId }, "Fetching all companies without phone");
    
    const allCompanies = await fetchAllRecords(
      '/crm/v3/objects/companies',
      token,
      ["name", "domain", "phone", "hubspot_owner_id", "createdate"],
      (company) => !company.properties.phone // Filtrar solo empresas sin teléfono
    );
    
    fastify.log.info({ portalId, count: allCompanies.length }, "Companies without phone fetched");
    
    // Preparar datos para Excel
    const data = [
      ["Company Name", "Domain", "Owner ID", "Created Date", "Company ID", "URL"]
    ];
    
    allCompanies.forEach(company => {
      const p = company.properties;
      const companyUrl = `https://app.hubspot.com/contacts/${portalId}/company/${company.id}`;
      
      data.push([
        p.name || 'Sin nombre',
        p.domain || '',
        p.hubspot_owner_id || 'Sin owner',
        p.createdate || '',
        company.id,
        companyUrl
      ]);
    });
    
    // Crear workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    ws['!cols'] = [
      { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 50 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, "Empresas sin Teléfono");
    
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  } catch (error) {
    fastify.log.error({ err: error, portalId }, "Error generating companies without phone XLSX");
    throw error;
  }
}
