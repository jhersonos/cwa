/**
 * EXPORT SERVICE
 * Genera exportaciones CSV de auditoría completa
 */

import { fetchContacts } from "../hubspot/contacts.service.js";
import { fetchDeals } from "../hubspot/deals.service.js";
import { fetchCompanies } from "../hubspot/companies.service.js";

/**
 * Genera CSV completo de resumen de auditoría
 */
export async function generateAuditSummaryCSV(scanData, portalId) {
  const { efficiency, contacts, users, deals, companies, insights, trafficLights } = scanData;

  const lines = [];
  
  // Header
  lines.push("Cost CRM Risk Scanner - Resumen de Auditoría Completa");
  lines.push(`Fecha del análisis,${new Date().toISOString().split('T')[0]}`);
  lines.push(`Portal ID,${portalId}`);
  lines.push("");
  
  // Scores globales
  lines.push("PUNTUACIÓN GLOBAL");
  lines.push(`Score de eficiencia,${efficiency.score}/100`);
  lines.push(`Nivel,${efficiency.level}`);
  lines.push("");
  
  // Scores por objeto
  lines.push("PUNTUACIÓN POR OBJETO");
  if (trafficLights.contacts) {
    lines.push(`Contactos,${trafficLights.contacts.score}/100,${trafficLights.contacts.label}`);
  }
  if (trafficLights.deals) {
    lines.push(`Deals,${trafficLights.deals.score}/100,${trafficLights.deals.label}`);
  }
  if (trafficLights.companies) {
    lines.push(`Empresas,${trafficLights.companies.score}/100,${trafficLights.companies.label}`);
  }
  if (trafficLights.users) {
    lines.push(`Usuarios,${trafficLights.users.score}/100,${trafficLights.users.label}`);
  }
  lines.push("");
  
  // Instantánea diagnóstica
  lines.push("INSTANTÁNEA DIAGNÓSTICA");
  lines.push(`Contactos analizados,${contacts.total}`);
  lines.push(`Contactos sin email,${contacts.withoutEmail}`);
  lines.push(`Contactos sin teléfono,${contacts.withoutPhone}`);
  lines.push(`Contactos sin lifecycle,${contacts.withoutLifecycle}`);
  lines.push(`Contactos obsoletos,${contacts.stale}`);
  lines.push("");
  
  if (deals && deals.total > 0) {
    lines.push(`Deals analizados,${deals.total}`);
    lines.push(`Deals sin contacto,${deals.withoutContact.count} (${deals.withoutContact.percentage}%)`);
    lines.push(`Deals sin owner,${deals.withoutOwner.count} (${deals.withoutOwner.percentage}%)`);
    lines.push(`Deals sin precio,${deals.withoutPrice.count} (${deals.withoutPrice.percentage}%)`);
    lines.push(`Deals inactivos,${deals.inactive.count} (${deals.inactive.percentage}%)`);
    lines.push("");
  }
  
  if (companies && companies.total > 0) {
    lines.push(`Empresas analizadas,${companies.total}`);
    lines.push(`Empresas sin dominio,${companies.withoutDomain.count} (${companies.withoutDomain.percentage}%)`);
    lines.push(`Empresas sin owner,${companies.withoutOwner.count} (${companies.withoutOwner.percentage}%)`);
    lines.push(`Empresas sin teléfono,${companies.withoutPhone.count} (${companies.withoutPhone.percentage}%)`);
    lines.push(`Empresas inactivas,${companies.inactive.count} (${companies.inactive.percentage}%)`);
    lines.push("");
  }
  
  // Insights críticos
  lines.push("INSIGHTS CRÍTICOS DETECTADOS");
  const criticalInsights = insights.filter(i => i.severity === 'critical');
  if (criticalInsights.length > 0) {
    criticalInsights.forEach(insight => {
      lines.push(`"${insight.title}"`);
      lines.push(`Severidad,${insight.severity.toUpperCase()}`);
      lines.push(`Urgencia,${insight.urgency}`);
      lines.push(`Impacto,"${insight.businessImpact}"`);
      lines.push(`Recomendación,"${insight.recommendation}"`);
      lines.push("");
    });
  } else {
    lines.push("No se detectaron insights críticos");
    lines.push("");
  }
  
  // Nota de muestreo
  lines.push("NOTA METODOLÓGICA");
  lines.push(`"Este diagnóstico se basa en muestreo inteligente de registros. Los patrones detectados en la muestra son indicativos de tendencias en el resto de la cuenta. Para auditoría exhaustiva completa, contactar a Estado 7."`);
  
  return lines.join('\n');
}

/**
 * Genera CSV de deals sin owner
 */
export async function generateDealsWithoutOwnerCSV(fastify, portalId, token) {
  try {
    const deals = await fetchDeals(fastify, portalId, token, { limit: 1000 });
    const dealsWithoutOwner = deals.filter(d => !d.properties.hubspot_owner_id);
    
    const lines = [];
    lines.push("Deal Name,Deal Stage,Amount,Close Date,Deal ID,URL");
    
    dealsWithoutOwner.forEach(deal => {
      const p = deal.properties;
      const amount = p.amount || '';
      const stage = p.dealstage || 'Sin etapa';
      const closeDate = p.closedate || '';
      const dealUrl = `https://app.hubspot.com/contacts/${portalId}/deal/${deal.id}`;
      
      lines.push(`"${p.dealname || 'Sin nombre'}","${stage}","${amount}","${closeDate}","${deal.id}","${dealUrl}"`);
    });
    
    return lines.join('\n');
  } catch (error) {
    fastify.log.error({ err: error, portalId }, "Error generating deals without owner CSV");
    throw error;
  }
}

/**
 * Genera CSV de deals sin contacto
 */
export async function generateDealsWithoutContactCSV(fastify, portalId, token, dealsData) {
  const lines = [];
  lines.push("Deal Name,Deal Stage,Amount,Deal ID,URL");
  
  if (dealsData.withoutContact?.items) {
    dealsData.withoutContact.items.forEach(deal => {
      const amount = deal.amount || '';
      const stage = deal.stage || 'Sin etapa';
      const dealUrl = `https://app.hubspot.com/contacts/${portalId}/deal/${deal.id}`;
      
      lines.push(`"${deal.name || 'Sin nombre'}","${stage}","${amount}","${deal.id}","${dealUrl}"`);
    });
  }
  
  return lines.join('\n');
}

/**
 * Genera CSV de deals sin amount
 */
export async function generateDealsWithoutAmountCSV(fastify, portalId, token, dealsData) {
  const lines = [];
  lines.push("Deal Name,Deal Stage,Owner,Deal ID,URL");
  
  if (dealsData.withoutPrice?.items) {
    dealsData.withoutPrice.items.forEach(deal => {
      const stage = deal.stage || 'Sin etapa';
      const owner = deal.owner || 'Sin owner';
      const dealUrl = `https://app.hubspot.com/contacts/${portalId}/deal/${deal.id}`;
      
      lines.push(`"${deal.name || 'Sin nombre'}","${stage}","${owner}","${deal.id}","${dealUrl}"`);
    });
  }
  
  return lines.join('\n');
}

/**
 * Genera CSV de contactos sin email
 */
export async function generateContactsWithoutEmailCSV(fastify, portalId, token) {
  try {
    const contacts = await fetchContacts(fastify, portalId, token, { limit: 1000 });
    const contactsWithoutEmail = contacts.filter(c => !c.properties.email);
    
    const lines = [];
    lines.push("First Name,Last Name,Phone,Lifecycle Stage,Contact ID,URL");
    
    contactsWithoutEmail.forEach(contact => {
      const p = contact.properties;
      const phone = p.phone || p.mobilephone || '';
      const lifecycle = p.lifecyclestage || 'Sin lifecycle';
      const contactUrl = `https://app.hubspot.com/contacts/${portalId}/contact/${contact.id}`;
      
      lines.push(`"${p.firstname || ''}","${p.lastname || ''}","${phone}","${lifecycle}","${contact.id}","${contactUrl}"`);
    });
    
    return lines.join('\n');
  } catch (error) {
    fastify.log.error({ err: error, portalId }, "Error generating contacts without email CSV");
    throw error;
  }
}

/**
 * Genera CSV de empresas sin teléfono
 */
export async function generateCompaniesWithoutPhoneCSV(fastify, portalId, token) {
  try {
    const companies = await fetchCompanies(fastify, portalId, token, { limit: 1000 });
    const companiesWithoutPhone = companies.filter(c => !c.properties.phone);
    
    const lines = [];
    lines.push("Company Name,Domain,Owner,Company ID,URL");
    
    companiesWithoutPhone.forEach(company => {
      const p = company.properties;
      const domain = p.domain || '';
      const owner = p.hubspot_owner_id || 'Sin owner';
      const companyUrl = `https://app.hubspot.com/contacts/${portalId}/company/${company.id}`;
      
      lines.push(`"${p.name || 'Sin nombre'}","${domain}","${owner}","${company.id}","${companyUrl}"`);
    });
    
    return lines.join('\n');
  } catch (error) {
    fastify.log.error({ err: error, portalId }, "Error generating companies without phone CSV");
    throw error;
  }
}

