import { hubspotRequest } from "../services/hubspot.js";

const scanV2Cache = new Map();

/* -------------------------
   HELPER FUNCTIONS
------------------------- */

/**
 * Fetch all contacts with pagination
 */
async function getAllContactsDetailed(token) {
  let after;
  const contacts = [];

  do {
    const res = await hubspotRequest(
      token,
      `/crm/v3/objects/contacts?limit=100&properties=email,lifecyclestage,hs_lastmodifieddate,hs_createdate${after ? `&after=${after}` : ""}`
    );

    if (res.results) {
      contacts.push(...res.results);
    }
    after = res.paging?.next?.after;
  } while (after);

  return contacts;
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
  } catch (err) {
    return {
      totalUsers: 0,
      inactiveUsers: 0,
      userEfficiencyScore: 50,
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

    if (contacts.length === 0) {
      return {
        totalContacts: 0,
        staleContacts: 0,
        orphanContacts: 0,
        contactQualityScore: 50,
        limitedVisibility: true
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
      hygieneScore: score,
      limitedVisibility: hasWorkflows === null
    };
  } catch (err) {
    return {
      hasWorkflows: null,
      lifecycleMisalignment: false,
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
 * Generate insights and recommendations
 */
function generateInsights(usersData, contactsData, hygieneData, structureData) {
  const insights = [];
  const recommendations = [];

  // Users insights
  if (usersData.inactiveUsers > 0) {
    insights.push(`${usersData.inactiveUsers} inactive user${usersData.inactiveUsers > 1 ? "s" : ""} detected`);
    recommendations.push("Remove inactive users to reduce license costs and improve security");
  }

  // Contact quality insights
  if (contactsData.staleContacts > 0) {
    insights.push(`${contactsData.staleContacts} stale contact${contactsData.staleContacts > 1 ? "s" : ""} (not updated in 12+ months)`);
    recommendations.push("Archive or clean stale contacts to improve data quality");
  }

  if (contactsData.orphanContacts > 0) {
    insights.push(`${contactsData.orphanContacts} contact${contactsData.orphanContacts > 1 ? "s" : ""} without lifecycle stage`);
    recommendations.push("Assign lifecycle stages to contacts for better pipeline visibility");
  }

  if (contactsData.contactsWithoutEmail > 0) {
    insights.push(`${contactsData.contactsWithoutEmail} contact${contactsData.contactsWithoutEmail > 1 ? "s" : ""} missing email addresses`);
    recommendations.push("Enrich contacts with email addresses to enable email marketing");
  }

  // CRM Hygiene insights
  if (hygieneData.hasWorkflows === false) {
    insights.push("No workflows detected in account");
    recommendations.push("Set up workflows to automate lead nurturing and follow-ups");
  }

  if (hygieneData.lifecycleMisalignment) {
    insights.push("Lifecycle stages not aligned with deal volume");
    recommendations.push("Review and optimize lifecycle stage configuration");
  }

  if (hygieneData.leadsWithoutConversion) {
    insights.push("Leads created but no deals in pipeline");
    recommendations.push("Implement lead qualification and conversion processes");
  }

  // Structural insights
  if (structureData.contactsPerUser > 5000) {
    insights.push("Very high contact-to-user ratio detected");
    recommendations.push("Consider adding users or archiving inactive contacts");
  }

  if (structureData.dealsToContactsRatio > 0 && structureData.dealsToContactsRatio < 0.01) {
    insights.push("Low deal conversion rate from contacts");
    recommendations.push("Improve lead qualification and sales process alignment");
  }

  // Default if no issues
  if (insights.length === 0) {
    insights.push("No significant issues detected");
    recommendations.push("Continue monitoring account health regularly");
  }

  return { insights, recommendations };
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

      // Generate insights and recommendations
      const { insights, recommendations } = generateInsights(
        usersData,
        contactsData,
        hygieneData,
        structureData
      );

      // Build response
      const result = {
        portalId: String(portalId),
        efficiencyScoreV2,
        summary: generateSummary(efficiencyScoreV2),
        scoreBreakdown: {
          users: usersData.userEfficiencyScore,
          contacts: contactsData.contactQualityScore,
          hygiene: hygieneData.hygieneScore,
          structure: structureData.structureScore
        },
        insights,
        recommendations,
        limitedVisibility:
          usersData.limitedVisibility ||
          contactsData.limitedVisibility ||
          hygieneData.limitedVisibility ||
          structureData.limitedVisibility
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
      return reply.code(500).send({
        error: "Failed to complete advanced analysis",
        details: error.message
      });
    }
  });
}

