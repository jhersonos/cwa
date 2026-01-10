// src/services/analysis/tools.analysis.js
import axios from "axios";

const HUBSPOT_API = "https://api.hubapi.com";

/**
 * Analiza qué herramientas de HubSpot no se están usando
 * 🚀 Optimizado: Llamadas en paralelo
 */
export async function analyzeToolsUsage(fastify, portalId, token) {
  const unused = [];
  const inUse = [];
  let limitedVisibility = false;

  // 🚀 Hacer todas las llamadas en paralelo para velocidad
  const checks = await Promise.allSettled([
    // Deals
    axios.get(`${HUBSPOT_API}/crm/v3/objects/deals?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 2500
    }),
    // Tickets
    axios.get(`${HUBSPOT_API}/crm/v3/objects/tickets?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 2500
    }),
    // Companies
    axios.get(`${HUBSPOT_API}/crm/v3/objects/companies?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 2500
    }),
    // Workflows
    axios.get(`${HUBSPOT_API}/automation/v3/workflows?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 2500
    }),
    // Forms
    axios.get(`${HUBSPOT_API}/marketing/v3/forms?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 2500
    }),
    // Landing Pages
    axios.get(`${HUBSPOT_API}/cms/v3/pages/landing-pages?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 2500
    }),
    // Website Pages
    axios.get(`${HUBSPOT_API}/cms/v3/pages/site-pages?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 2500
    }),
    // Blog
    axios.get(`${HUBSPOT_API}/cms/v3/blogs/posts?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 2500
    }),
    // Custom Objects (skip - 403 en muchas cuentas)
    Promise.resolve({ data: { results: [] } })
  ]);

  /* ----------------------------------
     PROCESAR RESULTADOS
  ---------------------------------- */
  
  // Deals
  if (checks[0].status === 'fulfilled' && (checks[0].value?.data?.results?.length || 0) > 0) {
    inUse.push({ tool: "Deals", category: "CRM" });
  } else if (checks[0].status === 'fulfilled') {
    unused.push({ tool: "Deals", category: "CRM", reason: "No deals created" });
  } else {
    limitedVisibility = true;
  }

  // Tickets
  if (checks[1].status === 'fulfilled' && (checks[1].value?.data?.results?.length || 0) > 0) {
    inUse.push({ tool: "Tickets", category: "Service" });
  } else if (checks[1].status === 'fulfilled') {
    unused.push({ tool: "Tickets", category: "Service", reason: "No tickets created" });
  } else {
    limitedVisibility = true;
  }

  // Companies
  if (checks[2].status === 'fulfilled' && (checks[2].value?.data?.results?.length || 0) > 0) {
    inUse.push({ tool: "Companies", category: "CRM" });
  } else if (checks[2].status === 'fulfilled') {
    unused.push({ tool: "Companies", category: "CRM", reason: "No companies created" });
  } else {
    limitedVisibility = true;
  }

  // Workflows
  if (checks[3].status === 'fulfilled' && (checks[3].value?.data?.results?.length || 0) > 0) {
    inUse.push({ tool: "Workflows", category: "Automation" });
  } else if (checks[3].status === 'fulfilled') {
    unused.push({ tool: "Workflows", category: "Automation", reason: "No workflows created" });
  }

  // Forms
  if (checks[4].status === 'fulfilled' && (checks[4].value?.data?.results?.length || 0) > 0) {
    inUse.push({ tool: "Forms", category: "Marketing" });
  } else if (checks[4].status === 'fulfilled') {
    unused.push({ tool: "Forms", category: "Marketing", reason: "No forms created" });
  } else {
    limitedVisibility = true;
  }

  // Landing Pages
  if (checks[5].status === 'fulfilled' && (checks[5].value?.data?.results?.length || 0) > 0) {
    inUse.push({ tool: "Landing Pages", category: "CMS" });
  } else if (checks[5].status === 'fulfilled') {
    unused.push({ tool: "Landing Pages", category: "CMS", reason: "No landing pages created" });
  }

  // Website Pages
  if (checks[6].status === 'fulfilled' && (checks[6].value?.data?.results?.length || 0) > 0) {
    inUse.push({ tool: "Website Pages", category: "CMS" });
  } else if (checks[6].status === 'fulfilled') {
    unused.push({ tool: "Website Pages", category: "CMS", reason: "No website pages created" });
  }

  // Blog
  if (checks[7].status === 'fulfilled' && (checks[7].value?.data?.results?.length || 0) > 0) {
    inUse.push({ tool: "Blog", category: "CMS" });
  } else if (checks[7].status === 'fulfilled') {
    unused.push({ tool: "Blog", category: "CMS", reason: "No blog posts created" });
  }

  // Custom Objects
  if (checks[8].status === 'fulfilled') {
    const customObjects = (checks[8].value?.data?.results || []).filter(
      schema => !['contacts', 'companies', 'deals', 'tickets'].includes(schema.name)
    );
    
    if (customObjects.length > 0) {
      inUse.push({ 
        tool: `Custom Objects (${customObjects.length})`, 
        category: "CRM" 
      });
    } else {
      unused.push({ 
        tool: "Custom Objects", 
        category: "CRM", 
        reason: "No custom objects created" 
      });
    }
  } else {
    limitedVisibility = true;
  }

  /* ----------------------------------
     SUMMARY
  ---------------------------------- */

  const totalTools = unused.length + inUse.length;
  const usagePercentage = totalTools > 0
    ? Number(((inUse.length / totalTools) * 100).toFixed(1))
    : 0;

  return {
    unused,
    inUse,
    totalTools,
    usagePercentage,
    limitedVisibility
  };
}

