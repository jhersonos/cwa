/**
 * PRIORITIZATION SERVICE V3 - AUDITOR SENIOR
 * 
 * Genera resumen ejecutivo y priorización de riesgos
 * Ordena por: 1) Impacto en negocio, 2) Severidad, 3) Urgencia
 */

const SEVERITY_WEIGHT = {
  critical: 3,
  warning: 2,
  info: 1
};

const URGENCY_WEIGHT = {
  alta: 3,
  media: 2,
  baja: 1
};

export function generatePrioritization(insights = []) {
  /* ====================================
     RESUMEN CUANTITATIVO
  ==================================== */
  const summary = {
    totalInsights: insights.length,
    critical: 0,
    warning: 0,
    info: 0,
    highestSeverity: "info",
    urgentCount: 0  // Critical + Warning con urgencia alta
  };

  insights.forEach(insight => {
    if (summary[insight.severity] !== undefined) {
      summary[insight.severity]++;
    }
    
    if ((insight.severity === 'critical' || insight.severity === 'warning') && 
        insight.urgency === 'alta') {
      summary.urgentCount++;
    }
  });

  if (summary.critical > 0) summary.highestSeverity = "critical";
  else if (summary.warning > 0) summary.highestSeverity = "warning";

  /* ====================================
     PRIORIZACIÓN INTELIGENTE
     Ordena por: impacto → severidad → urgencia
  ==================================== */
  const prioritizedInsights = insights
    .map(insight => ({
      ...insight,
      priorityScore: calculatePriorityScore(insight)
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore);

  // Top 5 riesgos más importantes
  const topRisks = prioritizedInsights
    .filter(i => i.severity !== "info")
    .slice(0, 5);

  /* ====================================
     RESUMEN EJECUTIVO
  ==================================== */
  const executiveSummary = generateExecutiveSummary(summary, insights);

  /* ====================================
     PRÓXIMO PASO RECOMENDADO
  ==================================== */
  const nextStep = determineNextStep(summary, topRisks);

  return {
    summary,
    topRisks,
    prioritizedInsights,
    executiveSummary,
    nextStep,
    recommendation: executiveSummary  // Backwards compatibility
  };
}

/**
 * Calcula score de prioridad combinando severidad, urgencia e impacto
 */
function calculatePriorityScore(insight) {
  const severityScore = SEVERITY_WEIGHT[insight.severity] || 1;
  const urgencyScore = URGENCY_WEIGHT[insight.urgency] || 1;
  
  // Peso extra si tiene impacto en negocio explícito
  const impactBonus = insight.businessImpact ? 10 : 0;
  
  return (severityScore * 10) + (urgencyScore * 5) + impactBonus;
}

/**
 * Genera resumen ejecutivo profesional
 */
function generateExecutiveSummary(summary, insights) {
  if (summary.critical === 0 && summary.warning === 0) {
    return "La cuenta presenta indicadores saludables de gobernanza CRM. No se detectaron riesgos operativos críticos en la muestra analizada. Se recomienda mantener disciplina en procesos actuales y realizar revisiones trimestrales preventivas.";
  }

  let executiveSummary = "";

  // Evaluación de severidad
  if (summary.critical > 0) {
    executiveSummary = `Se detectaron ${summary.critical} riesgo(s) crítico(s) que afectan directamente operación comercial, forecasting o automatización. `;
    
    if (summary.urgentCount > 0) {
      executiveSummary += `${summary.urgentCount} de ellos requieren acción inmediata. `;
    }

    // Identificar áreas específicas afectadas
    const criticalAreas = insights
      .filter(i => i.severity === 'critical')
      .map(i => i.relatedModule)
      .filter((v, i, a) => a.indexOf(v) === i);  // unique

    if (criticalAreas.length > 0) {
      executiveSummary += `Áreas afectadas: ${formatModules(criticalAreas)}. `;
    }

    executiveSummary += "Se recomienda auditoría profesional completa para evaluar impacto total y diseñar plan de remediación estructurado.";
  } 
  else if (summary.warning > 0) {
    executiveSummary = `Se identificaron ${summary.warning} oportunidad(es) de optimización que afectan eficiencia operativa y calidad de datos. `;
    
    if (summary.urgentCount > 0) {
      executiveSummary += `${summary.urgentCount} de ellas con prioridad alta. `;
    }

    executiveSummary += "Aunque no bloquean operación actual, abordarlas mejorará forecasting, productividad del equipo y ROI en licencias de HubSpot. ";
    executiveSummary += "Se recomienda revisión experta para priorizar acciones correctivas según impacto en negocio.";
  }

  return executiveSummary;
}

/**
 * Determina próximo paso recomendado según severidad de hallazgos
 */
function determineNextStep(summary, topRisks) {
  if (summary.critical >= 3) {
    return {
      action: "Auditoría profesional urgente",
      reason: "Múltiples riesgos críticos detectados que afectan operación comercial y confiabilidad de reportes.",
      timeframe: "Dentro de 7 días",
      contactCTA: true
    };
  }
  
  if (summary.critical > 0 || summary.urgentCount >= 2) {
    return {
      action: "Revisión experta prioritaria",
      reason: "Riesgos operativos detectados requieren evaluación profesional para diseñar plan de remediación.",
      timeframe: "Dentro de 15 días",
      contactCTA: true
    };
  }
  
  if (summary.warning >= 3) {
    return {
      action: "Optimización guiada",
      reason: "Oportunidades de mejora identificadas que pueden incrementar eficiencia y ROI.",
      timeframe: "Próximo mes",
      contactCTA: true
    };
  }

  return {
    action: "Monitoreo trimestral",
    reason: "Mantener revisiones periódicas para detectar regresiones tempranas.",
    timeframe: "Cada 90 días",
    contactCTA: false
  };
}

/**
 * Formatea lista de módulos para lectura humana
 */
function formatModules(modules) {
  const moduleNames = {
    contacts: 'Contactos',
    users: 'Usuarios',
    deals: 'Deals',
    companies: 'Empresas',
    tools: 'Herramientas',
    global: 'General'
  };

  return modules
    .map(m => moduleNames[m] || m)
    .join(', ');
}
