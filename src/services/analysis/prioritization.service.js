// src/services/analysis/prioritization.service.js

const SEVERITY_ORDER = {
    critical: 3,
    warning: 2,
    info: 1
  };
  
  export function generatePrioritization(insights = []) {
    const summary = {
      totalInsights: insights.length,
      critical: 0,
      warning: 0,
      info: 0,
      highestSeverity: "info"
    };
  
    insights.forEach(insight => {
      if (summary[insight.severity] !== undefined) {
        summary[insight.severity]++;
      }
    });
  
    if (summary.critical > 0) summary.highestSeverity = "critical";
    else if (summary.warning > 0) summary.highestSeverity = "warning";
  
    const topRisks = insights
      .filter(i => i.severity !== "info")
      .sort(
        (a, b) =>
          SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
      )
      .slice(0, 3);
  
    let recommendation = "Your account is in good condition.";
  
    if (summary.critical > 0) {
      recommendation =
        "Critical inefficiencies detected. Immediate action is recommended to reduce cost and operational risk.";
    } else if (summary.warning > 0) {
      recommendation =
        "Some optimization opportunities were detected. Addressing them will improve efficiency and reduce future risks.";
    }
  
    return {
      summary,
      topRisks,
      recommendation
    };
  }
  