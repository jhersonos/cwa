// src/services/analysis/tools.analysis.js
import axios from "axios";

const HUBSPOT_API = "https://api.hubapi.com";

/**
 * Analiza qué herramientas de HubSpot no se están usando
 */
export async function analyzeToolsUsage(fastify, portalId, token) {
  const unused = [];
  const inUse = [];
  let limitedVisibility = false;

  /* ----------------------------------
     CHECK DEALS
  ---------------------------------- */
  try {
    const dealsRes = await axios.get(
      `${HUBSPOT_API}/crm/v3/objects/deals?limit=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000
      }
    );
    
    const hasDeal = (dealsRes.data?.results?.length || 0) > 0;
    if (hasDeal) {
      inUse.push({ tool: "Deals", category: "CRM" });
    } else {
      unused.push({ tool: "Deals", category: "CRM", reason: "No deals created" });
    }
  } catch {
    limitedVisibility = true;
  }

  /* ----------------------------------
     CHECK TICKETS
  ---------------------------------- */
  try {
    const ticketsRes = await axios.get(
      `${HUBSPOT_API}/crm/v3/objects/tickets?limit=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000
      }
    );
    
    const hasTicket = (ticketsRes.data?.results?.length || 0) > 0;
    if (hasTicket) {
      inUse.push({ tool: "Tickets", category: "Service" });
    } else {
      unused.push({ tool: "Tickets", category: "Service", reason: "No tickets created" });
    }
  } catch {
    limitedVisibility = true;
  }

  /* ----------------------------------
     CHECK COMPANIES
  ---------------------------------- */
  try {
    const companiesRes = await axios.get(
      `${HUBSPOT_API}/crm/v3/objects/companies?limit=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000
      }
    );
    
    const hasCompany = (companiesRes.data?.results?.length || 0) > 0;
    if (hasCompany) {
      inUse.push({ tool: "Companies", category: "CRM" });
    } else {
      unused.push({ tool: "Companies", category: "CRM", reason: "No companies created" });
    }
  } catch {
    limitedVisibility = true;
  }

  /* ----------------------------------
     CHECK WORKFLOWS
  ---------------------------------- */
  try {
    const workflowsRes = await axios.get(
      `${HUBSPOT_API}/automation/v3/workflows?limit=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000
      }
    );
    
    const hasWorkflow = (workflowsRes.data?.results?.length || 0) > 0;
    if (hasWorkflow) {
      inUse.push({ tool: "Workflows", category: "Automation" });
    } else {
      unused.push({ tool: "Workflows", category: "Automation", reason: "No workflows created" });
    }
  } catch {
    // Workflows puede no estar disponible en planes básicos
  }

  /* ----------------------------------
     CHECK FORMS
  ---------------------------------- */
  try {
    const formsRes = await axios.get(
      `${HUBSPOT_API}/marketing/v3/forms?limit=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000
      }
    );
    
    const hasForm = (formsRes.data?.results?.length || 0) > 0;
    if (hasForm) {
      inUse.push({ tool: "Forms", category: "Marketing" });
    } else {
      unused.push({ tool: "Forms", category: "Marketing", reason: "No forms created" });
    }
  } catch {
    limitedVisibility = true;
  }

  /* ----------------------------------
     CHECK LANDING PAGES (CMS)
  ---------------------------------- */
  try {
    const pagesRes = await axios.get(
      `${HUBSPOT_API}/cms/v3/pages/landing-pages?limit=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000
      }
    );
    
    const hasPage = (pagesRes.data?.results?.length || 0) > 0;
    if (hasPage) {
      inUse.push({ tool: "Landing Pages", category: "CMS" });
    } else {
      unused.push({ tool: "Landing Pages", category: "CMS", reason: "No landing pages created" });
    }
  } catch {
    // CMS puede no estar disponible
  }

  /* ----------------------------------
     CHECK WEBSITE PAGES (CMS)
  ---------------------------------- */
  try {
    const sitePagesRes = await axios.get(
      `${HUBSPOT_API}/cms/v3/pages/site-pages?limit=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000
      }
    );
    
    const hasSitePage = (sitePagesRes.data?.results?.length || 0) > 0;
    if (hasSitePage) {
      inUse.push({ tool: "Website Pages", category: "CMS" });
    } else {
      unused.push({ tool: "Website Pages", category: "CMS", reason: "No website pages created" });
    }
  } catch {
    // CMS puede no estar disponible
  }

  /* ----------------------------------
     CHECK BLOG POSTS
  ---------------------------------- */
  try {
    const blogRes = await axios.get(
      `${HUBSPOT_API}/cms/v3/blogs/posts?limit=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000
      }
    );
    
    const hasBlog = (blogRes.data?.results?.length || 0) > 0;
    if (hasBlog) {
      inUse.push({ tool: "Blog", category: "CMS" });
    } else {
      unused.push({ tool: "Blog", category: "CMS", reason: "No blog posts created" });
    }
  } catch {
    // Blog puede no estar disponible
  }

  /* ----------------------------------
     CHECK CUSTOM OBJECTS
  ---------------------------------- */
  try {
    const customObjectsRes = await axios.get(
      `${HUBSPOT_API}/crm/v3/schemas`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000
      }
    );
    
    // Filter only custom objects (not standard ones like contacts, deals, etc.)
    const customObjects = (customObjectsRes.data?.results || []).filter(
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
  } catch {
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

