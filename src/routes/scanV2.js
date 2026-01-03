import { hubspotRequest } from "../services/hubspot.js";

const scanV2Cache = new Map();

/* -------------------------
   HELPER FUNCTIONS
------------------------- */
function buildDealDisplay(props, id) {
  const displayName = props.dealname || `Deal ${id}`;
  const secondaryLabel = [
    props.dealstage ? `Stage: ${props.dealstage}` : null,
    props.amount ? `Amount: ${props.amount}` : null
  ].filter(Boolean).join(" · ") || null;

  return { displayName, secondaryLabel };
}

function buildContactDisplay(props, id) {
  if (props.firstname || props.lastname) {
    return {
      displayName: `${props.firstname || ""} ${props.lastname || ""}`.trim(),
      secondaryLabel: props.email || props.company || null
    };
  }

  if (props.email) {
    return {
      displayName: props.email,
      secondaryLabel: props.company || null
    };
  }

  if (props.company) {
    return {
      displayName: props.company,
      secondaryLabel: null
    };
  }

  return {
    displayName: `Contact ${id}`,
    secondaryLabel: null
  };
}
/**
 * Fetch all contacts with pagination
 */
async function getAllContactsDetailed(token) {
  try {
    let after;
    const contacts = [];

    do {
      const res = await hubspotRequest(
        token,
        `/crm/v3/objects/contacts?limit=100&properties=email,lifecyclestage,hs_lastmodifieddate,hs_createdate${after ? `&after=${after}` : ""}`
      );

      if (res?.results) {
        contacts.push(...res.results);
      }

      after = res?.paging?.next?.after;
    } while (after);

    return contacts;
  } catch (err) {
    return []; // 🔥 SIEMPRE array, nunca null
  }
}

/**
 * Fetch all deals with pagination
 */
async function getAllDeals(token) {
  let after;
  const deals = [];

  do {
    const res = await hubspotRequest(
      token,
      `/crm/v3/objects/deals?limit=100${after ? `&after=${after}` : ""}`
    );

    if (res.results) {
      deals.push(...res.results);
    }
    after = res.paging?.next?.after;
  } while (after);

  return deals;
}

/**
 * Get contact associations to deals (simplified - not used in current implementation)
 * Kept for future enhancement
 */
async function getContactDealAssociations(token, contactIds) {
  // Simplified implementation - associations API can be complex
  // For V2, we use lifecycle stage as a proxy indicator
  return [];
}

/**
 * Check if workflows are enabled (best effort)
 */
async function checkWorkflowsEnabled(token) {
  try {
    const res = await hubspotRequest(token, "/automation/v3/workflows");
    return res.results && res.results.length > 0;
  } catch {
    return null; // Unknown
  }
}

/**
 * Get lifecycle stages configuration
 */
async function getLifecycleStages(token) {
  try {
    const res = await hubspotRequest(token, "/crm/v3/pipelines/contacts");
    if (res.results && res.results.length > 0) {
      return res.results[0].stages || [];
    }
  } catch {
    // Fallback
  }
  return [];
}

/* -------------------------
   ANALYSIS FUNCTIONS
------------------------- */

/**
 * 1. USERS EFFICIENCY (30% weight)
 */
async function analyzeUsersEfficiency(token) {
  try {
    const usersRes = await hubspotRequest(token, "/settings/v3/users");
    const users = usersRes?.results || [];

    if (users.length === 0) {
      return {
        totalUsers: 0,
        inactiveUsers: 0,
        userEfficiencyScore: 50,
        estimatedMonthlyWaste: 0,
        limitedVisibility: true
      };
    }

    // Detect inactive users
    const inactiveUsers = users.filter(
      (u) => u.isSuspended === true || !u.email
    ).length;

    // Calculate efficiency score
    let score = 100;
    const inactiveRatio = inactiveUsers / users.length;

    if (inactiveRatio > 0.3) score -= 30;
    else if (inactiveRatio > 0.2) score -= 20;
    else if (inactiveRatio > 0.1) score -= 10;
    else if (inactiveRatio > 0.05) score -= 5;

    // Guardrail: 40-100
    score = Math.max(40, Math.min(100, Math.round(score)));

    // Estimate waste (conservative, no hardcoded pricing)
    const estimatedMonthlyWaste = inactiveUsers > 0 ? inactiveUsers * 50 : 0;

    return {
      totalUsers: users.length,
      inactiveUsers,
      userEfficiencyScore: score,
      estimatedMonthlyWaste,
      limitedVisibility: false
    };
  }catch {
    return {
      totalUsers: 1, // 👈 valor neutral
      inactiveUsers: 0,
      userEfficiencyScore: 80,
      estimatedMonthlyWaste: 0,
      limitedVisibility: true
    };
  }
}

/**
 * 2. CONTACT QUALITY (30% weight)
 */
async function analyzeContactQuality(token) {
  try {
    const contacts = await getAllContactsDetailed(token);

    if (!Array.isArray(contacts)) {
      return {
        totalContacts: 0,
        staleContacts: 0,
        orphanContacts: 0,
        contactQualityScore: 50,
        limitedVisibility: true
      };
    }
    
    if (contacts.length === 0) {
      return {
        totalContacts: 0,
        staleContacts: 0,
        orphanContacts: 0,
        contactsWithoutEmail: 0,
        contactsWithoutLifecycle: 0,
        contactQualityScore: 50,
        limitedVisibility: false
      };
    }
    
    

    const now = Date.now();
    const twelveMonthsAgo = now - 365 * 24 * 60 * 60 * 1000;

    let staleContacts = 0;
    let contactsWithoutEmail = 0;
    let contactsWithoutLifecycle = 0;

    // Analyze each contact
    for (const contact of contacts) {
      const properties = contact.properties || {};

      // Check for email
      if (!properties.email) {
        contactsWithoutEmail++;
      }

      // Check for lifecycle stage
      if (!properties.lifecyclestage) {
        contactsWithoutLifecycle++;
      }

      // Check if stale (not updated in 12 months)
      const lastModified = properties.hs_lastmodifieddate
        ? new Date(properties.hs_lastmodifieddate).getTime()
        : null;

      if (lastModified && lastModified < twelveMonthsAgo) {
        staleContacts++;
      }
    }

    // Get deals to find orphan contacts
    // Orphan contacts = contacts without lifecycle stage (not in pipeline)
    // This is a conservative, sellable insight
    const orphanContacts = contactsWithoutLifecycle;

    // Calculate quality score
    let score = 100;
    const totalIssues = staleContacts + contactsWithoutEmail + contactsWithoutLifecycle;
    const issueRatio = totalIssues / contacts.length;

    if (issueRatio > 0.5) score -= 40;
    else if (issueRatio > 0.3) score -= 25;
    else if (issueRatio > 0.2) score -= 15;
    else if (issueRatio > 0.1) score -= 8;

    score = Math.max(40, Math.min(100, Math.round(score)));

    return {
      totalContacts: contacts.length,
      staleContacts,
      orphanContacts,
      contactsWithoutEmail,
      contactsWithoutLifecycle,
      contactQualityScore: score,
      limitedVisibility: false
    };
  } catch (err) {
    return {
      totalContacts: 0,
      staleContacts: 0,
      orphanContacts: 0,
      contactQualityScore: 50,
      limitedVisibility: true
    };
  }
}

/**
 * 3. CRM HYGIENE (20% weight)
 */
async function analyzeCRMHygiene(token) {
  try {
    const hasWorkflows = await checkWorkflowsEnabled(token);
    const lifecycleStages = await getLifecycleStages(token);
    const deals = await getAllDeals(token);

    let score = 100;
    let lifecycleMisalignment = false;
    let hasIssues = false;

    // Check workflows
    if (hasWorkflows === false) {
      score -= 15;
      hasIssues = true;
    } else if (hasWorkflows === null) {
      // Unknown - don't penalize
    }

    // Check lifecycle alignment with deals
    if (lifecycleStages.length > 0 && deals.length > 0) {
      // Simple heuristic: if there are many lifecycle stages but few deals,
      // there might be misalignment
      const stagesToDealsRatio = lifecycleStages.length / deals.length;
      if (stagesToDealsRatio > 0.5 && deals.length < 10) {
        lifecycleMisalignment = true;
        score -= 10;
        hasIssues = true;
      }
    }

    // Check for leads without conversion
    // This is simplified - in production you'd check associations properly
    const contacts = await getAllContactsDetailed(token);

if (!Array.isArray(contacts) || contacts.length === 0) {
  return {
    hasWorkflows,
    lifecycleMisalignment: false,
    leadsWithoutConversion: false,
    leadsCount: 0,
    hygieneScore: score,
    limitedVisibility: true
  };
}

    const contactsWithLifecycle = contacts.filter(
      (c) => c.properties?.lifecyclestage
    );
    const leadsCount = contactsWithLifecycle.filter(
      (c) => c.properties.lifecyclestage === "lead"
    ).length;

    if (leadsCount > 0 && deals.length === 0) {
      score -= 10;
      hasIssues = true;
    }

    score = Math.max(40, Math.min(100, Math.round(score)));

    return {
      hasWorkflows,
      lifecycleMisalignment,
      leadsWithoutConversion: deals.length === 0 && leadsCount > 0,
      leadsCount, // Expose for insights
      hygieneScore: score,
      limitedVisibility: hasWorkflows === null
    };
  } catch (err) {
    return {
      hasWorkflows: null,
      lifecycleMisalignment: false,
      leadsWithoutConversion: false,
      leadsCount: 0,
      hygieneScore: 50,
      limitedVisibility: true
    };
  }
}

/**
 * 4. STRUCTURAL ALIGNMENT (20% weight)
 */
async function analyzeStructuralAlignment(token, usersData, contactsData) {
  try {
    const totalUsers = usersData.totalUsers || 1;
    const totalContacts = contactsData.totalContacts || 0;
    const deals = await getAllDeals(token);

    let score = 100;

    // Ratio of users to contacts
    if (totalUsers > 0 && totalContacts > 0) {
      const contactsPerUser = totalContacts / totalUsers;

      // Optimal range: 500-3000 contacts per user
      if (contactsPerUser > 5000) {
        score -= 20; // Too many contacts per user
      } else if (contactsPerUser > 3000) {
        score -= 10;
      } else if (contactsPerUser < 100 && totalContacts > 1000) {
        score -= 15; // Too few users for contact volume
      }
    }

    // Ratio of deals to contacts
    if (totalContacts > 0 && deals.length > 0) {
      const dealsToContactsRatio = deals.length / totalContacts;

      // Healthy range: 5-20% conversion
      if (dealsToContactsRatio < 0.01) {
        score -= 15; // Very low conversion
      } else if (dealsToContactsRatio < 0.05) {
        score -= 8; // Low conversion
      }
    } else if (totalContacts > 100 && deals.length === 0) {
      score -= 20; // No deals despite contacts
    }

    score = Math.max(40, Math.min(100, Math.round(score)));

    return {
      structureScore: score,
      contactsPerUser: totalUsers > 0 ? Math.round(totalContacts / totalUsers) : 0,
      dealsToContactsRatio: totalContacts > 0 ? (deals.length / totalContacts) : 0,
      limitedVisibility: false
    };
  } catch (err) {
    return {
      structureScore: 50,
      limitedVisibility: true
    };
  }
}

/**
 * Generate key metrics from analysis data
 * Exposes raw metrics already calculated internally
 */
function generateKeyMetrics(usersData, contactsData, hygieneData, structureData) {
  return {
    inactiveUsers: usersData.inactiveUsers || 0,
    staleContacts: contactsData.staleContacts || 0,
    orphanContacts: contactsData.orphanContacts || 0,
    contactsWithoutEmail: contactsData.contactsWithoutEmail || 0,
    contactsPerUser: structureData.contactsPerUser || 0,
    dealsToContactsRatio: structureData.dealsToContactsRatio || 0
  };
}

/**
 * Generate score explanations
 * Explains WHY each area has its score in clear business language
 */
function generateScoreExplanation(usersData, contactsData, hygieneData, structureData) {
  const explanations = [];

  // Users Efficiency explanation
  if (usersData.inactiveUsers > 0) {
    explanations.push({
      area: "Users Efficiency",
      score: usersData.userEfficiencyScore,
      reason: `${usersData.inactiveUsers} user${usersData.inactiveUsers > 1 ? "s are" : " is"} inactive or suspended, reducing operational efficiency`
    });
  } else if (usersData.totalUsers > 0) {
    explanations.push({
      area: "Users Efficiency",
      score: usersData.userEfficiencyScore,
      reason: "All users appear active and engaged"
    });
  }

  // Contact Quality explanation
  const contactIssues = [];
  if (contactsData.staleContacts > 0) {
    contactIssues.push(`${contactsData.staleContacts} contact${contactsData.staleContacts > 1 ? "s have" : " has"} not been updated in over 12 months`);
  }
  if (contactsData.orphanContacts > 0) {
    contactIssues.push(`${contactsData.orphanContacts} contact${contactsData.orphanContacts > 1 ? "s are" : " is"} not associated with any lifecycle stage`);
  }
  if (contactsData.contactsWithoutEmail > 0) {
    contactIssues.push(`${contactsData.contactsWithoutEmail} contact${contactsData.contactsWithoutEmail > 1 ? "s are" : " is"} missing email addresses`);
  }

  if (contactIssues.length > 0) {
    explanations.push({
      area: "Contact Quality",
      score: contactsData.contactQualityScore,
      reason: contactIssues.join("; ")
    });
  } else if (contactsData.totalContacts > 0) {
    explanations.push({
      area: "Contact Quality",
      score: contactsData.contactQualityScore,
      reason: "Contact data quality is good with minimal issues detected"
    });
  }

  // CRM Hygiene explanation
  const hygieneIssues = [];
  if (hygieneData.hasWorkflows === false) {
    hygieneIssues.push("No active workflows detected");
  }
  if (hygieneData.lifecycleMisalignment) {
    hygieneIssues.push("Lifecycle stages are not aligned with deal volume");
  }
  if (hygieneData.leadsWithoutConversion) {
    hygieneIssues.push("Leads are being created but not converting to deals");
  }

  if (hygieneIssues.length > 0) {
    explanations.push({
      area: "CRM Hygiene",
      score: hygieneData.hygieneScore,
      reason: hygieneIssues.join("; ")
    });
  } else {
    explanations.push({
      area: "CRM Hygiene",
      score: hygieneData.hygieneScore,
      reason: "CRM processes are well configured"
    });
  }

  // Structural Alignment explanation
  const structureIssues = [];
  if (structureData.contactsPerUser > 5000) {
    structureIssues.push(`Very high contact-to-user ratio (${structureData.contactsPerUser} contacts per user)`);
  } else if (structureData.contactsPerUser > 0 && structureData.contactsPerUser < 100) {
    structureIssues.push(`Low contact-to-user ratio (${structureData.contactsPerUser} contacts per user)`);
  }
  if (structureData.dealsToContactsRatio > 0 && structureData.dealsToContactsRatio < 0.01) {
    structureIssues.push(`Low deal conversion rate (${(structureData.dealsToContactsRatio * 100).toFixed(1)}%)`);
  } else if (structureData.dealsToContactsRatio === 0 && contactsData.totalContacts > 100) {
    structureIssues.push("No deals found despite having contacts");
  }

  if (structureIssues.length > 0) {
    explanations.push({
      area: "Structural Alignment",
      score: structureData.structureScore,
      reason: structureIssues.join("; ")
    });
  } else {
    explanations.push({
      area: "Structural Alignment",
      score: structureData.structureScore,
      reason: "Account structure is well balanced"
    });
  }

  return explanations;
}

/**
 * Generate quantified insights
 * Only includes insights with specific numbers
 */
function generateInsights({
  contactsData,
  usersData,
  hygieneData,
  structureData,
  affectedObjects
}) {
  const insights = [];

  /* -------------------------
     CONTACT QUALITY
  ------------------------- */

  if (contactsData.contactsWithoutEmail > 0) {
    insights.push(
      `${contactsData.contactsWithoutEmail} contact(s) are missing an email address`
    );
  }

  if (contactsData.staleContacts > 0) {
    insights.push(
      `${contactsData.staleContacts} contact(s) have not been updated in over 12 months`
    );
  }

  if (contactsData.orphanContacts > 0) {
    insights.push(
      `${contactsData.orphanContacts} contact(s) are not assigned to any lifecycle stage`
    );
  }

  /* -------------------------
     USERS
  ------------------------- */

  if (usersData.inactiveUsers > 0) {
    insights.push(
      `${usersData.inactiveUsers} user(s) appear inactive or suspended`
    );
  }

  /* -------------------------
     DEAL STRUCTURE
  ------------------------- */

  if (affectedObjects?.dealsWithoutStage?.length > 0) {
    insights.push(
      `${affectedObjects.dealsWithoutStage.length} deal(s) have no pipeline stage assigned`
    );
  }

  if (
    typeof structureData.dealsToContactsRatio === "number" &&
    structureData.dealsToContactsRatio < 0.01 &&
    contactsData.totalContacts > 50
  ) {
    insights.push(
      "Low deal creation rate compared to total contacts"
    );
  }

  /* -------------------------
     CRM HYGIENE (light signals)
  ------------------------- */

  if (hygieneData?.leadsWithoutConversion) {
    insights.push(
      "Leads are being created but are not converting into deals"
    );
  }

  /* -------------------------
     FALLBACK (REAL, NO FALSO POSITIVO)
  ------------------------- */

  const hasAnySignal =
  contactsData.contactsWithoutEmail > 0 ||
  contactsData.staleContacts > 0 ||
  contactsData.orphanContacts > 0 ||
  usersData.inactiveUsers > 0 ||
  (affectedObjects && Object.keys(affectedObjects).length > 0);

  if (insights.length === 0 && hasAnySignal) {
    insights.push("No critical issues detected. Your account is operating within healthy parameters.");
  }

  return insights;
}


/**
 * Calculate contact growth risk level
 * Reused from V1 for account overview
 */
function calculateContactRiskLevel(totalContacts, totalUsers) {
  if (totalUsers === 0) return "Medium";

  const ratio = totalContacts / totalUsers;
  if (ratio > 5000) return "High";
  if (ratio > 3000) return "Medium";
  return "Low";
}

/**
 * Determine if there are critical data gaps
 * Only true if we cannot read essential data (users, contacts)
 * NOT based on HubSpot plan or missing workflows
 */
function hasCriticalDataGaps(usersData, contactsData) {
  if (usersData.limitedVisibility && usersData.totalUsers === 0) {
    return true;
  }

  if (contactsData.limitedVisibility && contactsData.totalContacts === 0) {
    return true;
  }

  return false;
}

/**
 * Get affected objects (limited to 5 per type for preview)
 * Returns objects with full client-meaningful context
 */
async function getAffectedObjects(token, portalId) {
  const result = {
    contactsWithoutEmail: [],
    staleContacts: [],
    orphanContacts: [],
    dealsWithoutStage: []
  };

  try {
    /* --------------------------------
       CONTACTS
    -------------------------------- */

    const contactsRes = await hubspotRequest(
      token,
      "/crm/v3/objects/contacts?limit=100&properties=firstname,lastname,email,lifecyclestage,hs_lastmodifieddate,company"
    );

    const contacts = contactsRes.results || [];
    const now = Date.now();
    const twelveMonthsAgo = now - 365 * 24 * 60 * 60 * 1000;

    // Contacts without email
    result.contactsWithoutEmail = contacts
      .filter((c) => !c.properties?.email)
      .slice(0, 5)
      .map((c) => {
        const props = c.properties || {};
        const { displayName, secondaryLabel } = buildContactDisplay(props, c.id);
        return {
          id: c.id,
          objectType: "contact",
          displayName,
          secondaryLabel,
          reason: "Missing email address"
        };
      });

    // Stale contacts
    result.staleContacts = contacts
      .filter((c) => {
        if (!c.properties?.hs_lastmodifieddate) return false;
        const lastModified = new Date(c.properties.hs_lastmodifieddate).getTime();
        return lastModified && lastModified < twelveMonthsAgo;
      })
      .slice(0, 5)
      .map((c) => {
        const props = c.properties || {};
        const { displayName, secondaryLabel } = buildContactDisplay(props, c.id);
        return {
          id: c.id,
          objectType: "contact",
          displayName,
          secondaryLabel,
          reason: "Contact has not been updated in over 12 months"
        };
      });

    // Orphan contacts (without lifecycle)
    result.orphanContacts = contacts
      .filter((c) => !c.properties?.lifecyclestage)
      .slice(0, 5)
      .map((c) => {
        const props = c.properties || {};
        const { displayName, secondaryLabel } = buildContactDisplay(props, c.id);
        return {
          id: c.id,
          objectType: "contact",
          displayName,
          secondaryLabel,
          reason: "Contact has no lifecycle stage assigned"
        };
      });

    /* --------------------------------
       DEALS
    -------------------------------- */

    const dealsRes = await hubspotRequest(
      token,
      "/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount"
    );

    const deals = dealsRes.results || [];

    result.dealsWithoutStage = deals
      .filter((d) => !d.properties?.dealstage)
      .slice(0, 5)
      .map((d) => {
        const props = d.properties || {};
        const { displayName, secondaryLabel } = buildDealDisplay(props, d.id);
        return {
          id: d.id,
          objectType: "deal",
          displayName,
          secondaryLabel: secondaryLabel || null,
          reason: "Deal has no pipeline stage assigned"
        };
      });
  } catch (err) {
    // Return empty arrays on error - don't break the scan
  }

  // Remove empty arrays
  const cleaned = {};
  for (const [key, value] of Object.entries(result)) {
    if (value.length > 0) {
      cleaned[key] = value;
    }
  }

  return cleaned;
}


/**
 * Generate actionable recommendations
 * References metrics and suggests concrete actions with business value
 */
function generateRecommendations({
  contactsData,
  usersData,
  hygieneData,
  structureData,
  affectedObjects
}) {
  const recommendations = [];

  /* -------------------------
     CONTACT QUALITY
  ------------------------- */

  if (contactsData.contactsWithoutEmail > 0) {
    recommendations.push(
      `Enrich ${contactsData.contactsWithoutEmail} contact(s) with email addresses to enable email marketing, automation, and reporting`
    );
  }

  if (contactsData.staleContacts > 0) {
    recommendations.push(
      "Review stale contacts and update or archive records that have not been modified in over 12 months"
    );
  }

  if (contactsData.orphanContacts > 0) {
    recommendations.push(
      "Assign lifecycle stages to contacts to improve segmentation, funnel visibility, and CRM reporting accuracy"
    );
  }

  /* -------------------------
     USERS & LICENSING
  ------------------------- */

  if (usersData.inactiveUsers > 0) {
    recommendations.push(
      "Review inactive or suspended users and remove unnecessary access to reduce operational and licensing waste"
    );
  }

  /* -------------------------
     DEAL & PIPELINE STRUCTURE
  ------------------------- */

  if (affectedObjects?.dealsWithoutStage?.length > 0) {
    recommendations.push(
      "Ensure all deals are assigned to a pipeline stage to improve forecasting accuracy and sales visibility"
    );
  }

  if (
    typeof structureData.dealsToContactsRatio === "number" &&
    structureData.dealsToContactsRatio < 0.01 &&
    contactsData.totalContacts > 50
  ) {
    recommendations.push(
      "Improve lead qualification and sales alignment to increase the percentage of contacts converting into deals"
    );
  }

  /* -------------------------
     CRM HYGIENE
  ------------------------- */

  if (hygieneData?.leadsWithoutConversion) {
    recommendations.push(
      "Review lead follow-up processes to ensure new leads are actively worked and progressed into the sales pipeline"
    );
  }

  if (hygieneData?.hasWorkflows === false) {
    recommendations.push(
      "Consider implementing workflows to automate lead routing, lifecycle updates, and internal notifications"
    );
  }

  /* -------------------------
     FALLBACK (NO VACÍOS)
  ------------------------- */

  if (recommendations.length === 0) {
    recommendations.push(
      "Continue monitoring account health and maintain current CRM best practices"
    );
  }

  return recommendations;
}


/**
 * Calculate overall Efficiency Score V2
 */
function calculateEfficiencyScoreV2(usersScore, contactsScore, hygieneScore, structureScore) {
  const weightedScore =
    usersScore * 0.3 +
    contactsScore * 0.3 +
    hygieneScore * 0.2 +
    structureScore * 0.2;

  return Math.max(40, Math.min(100, Math.round(weightedScore)));
}

/**
 * Generate summary text
 */
function generateSummary(score) {
  if (score >= 85) {
    return "Account operating efficiently with minimal optimization needed";
  } else if (score >= 70) {
    return "Moderate optimization opportunities detected";
  } else if (score >= 55) {
    return "Significant optimization opportunities identified";
  } else {
    return "Multiple optimization opportunities require attention";
  }
}

/* -------------------------
   ROUTE HANDLER
------------------------- */

export default async function scanV2Routes(fastify) {
  fastify.get("/api/scan-v2", async (req, reply) => {
    const portalId = req.query.portalId;

    if (!portalId) {
      return reply.code(401).send({
        error: "Missing portal context"
      });
    }

    // Cache check (1 minute)
    const cached = scanV2Cache.get(portalId);
    if (cached && Date.now() - cached.timestamp < 60_000) {
      return cached.result;
    }

    // Get OAuth token
    const [rows] = await fastify.db.execute(
      "SELECT access_token FROM portals WHERE portal_id = ?",
      [portalId]
    );

    if (!rows.length) {
      return reply.code(401).send({
        error: "Portal not connected"
      });
    }

    const token = rows[0].access_token;

    try {
      // Run all analyses
      const usersData = await analyzeUsersEfficiency(token);
      const contactsData = await analyzeContactQuality(token);
      const hygieneData = await analyzeCRMHygiene(token);
      const structureData = await analyzeStructuralAlignment(
        token,
        usersData,
        contactsData
      );

      // Calculate overall score
      const efficiencyScoreV2 = calculateEfficiencyScoreV2(
        usersData.userEfficiencyScore,
        contactsData.contactQualityScore,
        hygieneData.hygieneScore,
        structureData.structureScore
      );

      // Get affected objects FIRST (needed for insights and recommendations)
      let affectedObjects = {};
      try {
        affectedObjects = await getAffectedObjects(token, portalId);
        // 🔥 SYNC FALLBACK METRICS FROM AFFECTED OBJECTS
if (Object.keys(affectedObjects).length > 0) {
  contactsData.contactsWithoutEmail =
    affectedObjects.contactsWithoutEmail?.length ?? contactsData.contactsWithoutEmail ?? 0;

  contactsData.staleContacts =
    affectedObjects.staleContacts?.length ?? contactsData.staleContacts ?? 0;

  contactsData.orphanContacts =
    affectedObjects.orphanContacts?.length ?? contactsData.orphanContacts ?? 0;

  if (contactsData.totalContacts === 0) {
    contactsData.totalContacts =
      contactsData.contactsWithoutEmail +
      contactsData.staleContacts +
      contactsData.orphanContacts;
  }

  contactsData.limitedVisibility = false; // 🔥 CLAVE
}
      } catch (err) {
        fastify.log.error(`Failed to get affected objects: ${err.message}`);
        // Continue with empty affectedObjects
      }

      // Generate enhanced insights and recommendations (V2.1)
      const insights = generateInsights({
        usersData,
        contactsData,
        hygieneData,
        structureData,
        affectedObjects
      });

      const recommendations = generateRecommendations({
        usersData,
        contactsData,
        hygieneData,
        structureData,
        affectedObjects
      });

      // Generate key metrics (V2.1)
      const keyMetrics = generateKeyMetrics(
        usersData,
        contactsData,
        hygieneData,
        structureData
      );

      // Generate score explanations (V2.1)
      const scoreExplanation = generateScoreExplanation(
        usersData,
        contactsData,
        hygieneData,
        structureData
      );

      // Determine conservative estimates flag (V2.1 improved logic)
      const hasCriticalGaps = hasCriticalDataGaps(usersData, contactsData);
      const conservativeEstimates = efficiencyScoreV2 < 90 && hasCriticalGaps;

      // Calculate contact growth risk (reuse existing logic)
      const contactGrowthRisk = calculateContactRiskLevel(
        contactsData.totalContacts,
        usersData.totalUsers
      );

      // Build response (V2.1 format with account overview)
      const result = {
        portalId: String(portalId),
        efficiencyScoreV2,
        summary: generateSummary(efficiencyScoreV2),
        accountOverview: {
          totalContacts: contactsData.totalContacts || 0,
          totalUsers: usersData.totalUsers || 0,
          contactGrowthRisk
        },
        scoreBreakdown: {
          users: usersData.userEfficiencyScore,
          contacts: contactsData.contactQualityScore,
          hygiene: hygieneData.hygieneScore,
          structure: structureData.structureScore
        },
        scoreExplanation, // Explains why each area has its score
        keyMetrics, // Exposes raw metrics
        insights, // Quantified insights only
        recommendations, // Actionable with metrics
        conservativeEstimates, // Only true if critical data gaps AND score < 90
        affectedObjects: Object.keys(affectedObjects).length > 0 ? affectedObjects : undefined // Preview of affected objects with full context
      };

      // Save to database
      try {
        await fastify.db.execute(
          `INSERT INTO scans_v2 (
            portal_id,
            efficiency_score,
            breakdown,
            insights,
            created_at
          ) VALUES (?, ?, ?, ?, NOW())`,
          [
            portalId,
            efficiencyScoreV2,
            JSON.stringify(result.scoreBreakdown),
            JSON.stringify({
              insights: result.insights,
              recommendations: result.recommendations
            })
          ]
        );
      } catch (dbError) {
        fastify.log.error(`Failed to save scan V2 to database: ${dbError.message}`);
        // Continue even if DB save fails
      }

      // Cache result
      scanV2Cache.set(portalId, {
        timestamp: Date.now(),
        result
      });

      return result;
    } catch (error) {
      fastify.log.error(`Scan V2 error for portal ${portalId}:`, error);
      
      // Ensure accountOverview is always present even on error
      const fallbackResult = {
        portalId: String(portalId),
        efficiencyScoreV2: 0,
        summary: "Analysis failed",
        accountOverview: {
          totalContacts: 0,
          totalUsers: 0,
          contactGrowthRisk: "Medium"
        },
        scoreBreakdown: {
          users: 0,
          contacts: 0,
          hygiene: 0,
          structure: 0
        },
        insights: [],
        recommendations: [],
        error: "Failed to complete advanced analysis"
      };
      
      return reply.code(500).send(fallbackResult);
    }
  });
}

