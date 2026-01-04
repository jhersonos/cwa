/**
 * INSIGHTS GENERATOR (V3)
 * ✅ V1 SAFE
 * - Sin workflows
 * - Limited visibility SOLO por error real
 * - UX limpia y honesta
 */
export function generateInsights({
  efficiency,
  contacts,
  users
}) {
  const insights = [];

  /* --------------------------------------------------
     🔒 LIMITED VISIBILITY (GLOBAL)
     SOLO si hubo error real de permisos / API
  -------------------------------------------------- */
  if (efficiency.hasLimitedVisibility) {
    insights.push({
      id: "limited-visibility",
      severity: "warning",
      title: "Limited data visibility detected",
      description:
        "Some HubSpot data could not be analyzed due to missing permissions or API restrictions.",
      recommendation:
        "Review app permissions and ensure required access is granted.",
      relatedModule: "global"
    });
  }

  /* --------------------------------------------------
     CONTACTS
  -------------------------------------------------- */
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
        "Assign lifecycle stages automatically using form defaults or CRM rules.",
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

  /* --------------------------------------------------
     USERS
  -------------------------------------------------- */
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

  /* --------------------------------------------------
     POSITIVE INSIGHT (NO ISSUES)
  -------------------------------------------------- */
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
