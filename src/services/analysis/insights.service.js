// src/services/analysis/insights.service.js

export function generateInsights({
    efficiency,
    contacts,
    users,
    workflows = null
  }) {
    const insights = [];
  
    /* ------------------------
       EFFICIENCY (GLOBAL)
    ------------------------ */
    if (efficiency.hasLimitedVisibility) {
      insights.push({
        id: "limited-visibility",
        severity: "warning",
        title: "Limited data visibility detected",
        description:
          "Some HubSpot data could not be fully analyzed due to permission or scope limitations. This may hide operational risks.",
        recommendation:
          "Review app permissions and ensure full CRM access to improve analysis accuracy.",
        relatedModule: "global"
      });
    }
  
    /* ------------------------
       CONTACTS
    ------------------------ */
    if (contacts.withoutEmail > 0) {
      insights.push({
        id: "contacts-without-email",
        severity: "warning",
        title: "Contacts without email addresses",
        description:
          `${contacts.withoutEmail} contacts do not have an email address, limiting engagement and automation capabilities.`,
        recommendation:
          "Enrich your contact data or enforce email capture on all lead sources.",
        relatedModule: "contacts"
      });
    }
  
    if (contacts.withoutLifecycle > 0) {
      insights.push({
        id: "contacts-without-lifecycle",
        severity: "warning",
        title: "Contacts missing lifecycle stage",
        description:
          `${contacts.withoutLifecycle} contacts are missing a lifecycle stage, which impacts reporting and funnel visibility.`,
        recommendation:
          "Assign lifecycle stages automatically using workflows or form defaults.",
        relatedModule: "contacts"
      });
    }
  
    if (contacts.stale > 0) {
      insights.push({
        id: "stale-contacts",
        severity: "critical",
        title: "Stale contacts detected",
        description:
          `${contacts.stale} contacts have not been updated in a long time, increasing CRM clutter and cost.`,
        recommendation:
          "Run a cleanup process or archive stale contacts periodically.",
        relatedModule: "contacts"
      });
    }
  
    /* ------------------------
       USERS
    ------------------------ */
    if (users.inactive > 0) {
      insights.push({
        id: "inactive-users",
        severity: "critical",
        title: "Inactive HubSpot users detected",
        description:
          `${users.inactive} users appear inactive but still occupy paid seats.`,
        recommendation:
          "Remove or downgrade inactive users to reduce subscription costs.",
        relatedModule: "users"
      });
    }
  
    /* ------------------------
       WORKFLOWS (FASE 8)
    ------------------------ */
    if (workflows) {
      if (workflows.inactive > 0) {
        insights.push({
          id: "inactive-workflows",
          severity: "warning",
          title: "Inactive workflows detected",
          description:
            `${workflows.inactive} workflows are currently inactive, adding unnecessary complexity to your automation setup.`,
          recommendation:
            "Review and remove inactive workflows to simplify operations.",
          relatedModule: "workflows"
        });
      }
  
      if (workflows.legacy > 0) {
        insights.push({
          id: "legacy-workflows",
          severity: "critical",
          title: "Legacy workflows detected",
          description:
            `${workflows.legacy} workflows have not been updated in over 6 months and may be outdated.`,
          recommendation:
            "Audit legacy workflows and refactor or remove them.",
          relatedModule: "workflows"
        });
      }
    }
  
    /* ------------------------
       POSITIVE INSIGHT
    ------------------------ */
    if (insights.length === 0) {
      insights.push({
        id: "healthy-account",
        severity: "info",
        title: "Healthy HubSpot account",
        description:
          "No significant inefficiencies were detected. Your account is well-structured and optimized.",
        recommendation:
          "Maintain current governance and review periodically as your database grows.",
        relatedModule: "global"
      });
    }
  
    return insights;
  }
  