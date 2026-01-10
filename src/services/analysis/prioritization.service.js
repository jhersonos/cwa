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
  const samplingContext = "Cost CRM Risk Scanner realiza diagnóstico basado en muestreo inteligente: si un patrón aparece en la muestra, es muy probable que exista en el resto de la cuenta. ";

  if (summary.critical === 0 && summary.warning === 0) {
    return samplingContext + "La muestra analizada presenta indicadores saludables de gobernanza CRM. No se detectaron riesgos operativos críticos. Se recomienda mantener disciplina en procesos actuales y realizar revisiones trimestrales preventivas.";
  }

  let executiveSummary = samplingContext;

  // Evaluación de severidad
  if (summary.critical > 0) {
    executiveSummary += `Se detectaron ${summary.critical} patrón(es) de riesgo crítico que afectan directamente operación comercial, forecasting o automatización. `;
    
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
    executiveSummary += `Se identificaron ${summary.warning} patrón(es) de oportunidad de optimización que afectan eficiencia operativa y calidad de datos. `;
    
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
 * Retorna un string simple para renderizar en frontend
 */
function determineNextStep(summary, topRisks) {
  // Identificar el riesgo más grave
  const topRisk = topRisks[0];
  const topRiskTitle = topRisk ? topRisk.title : '';
  
  if (summary.critical >= 3) {
    return `Auditoría profesional urgente: múltiples riesgos críticos detectados que afectan operación comercial y confiabilidad de reportes. Se recomienda revisión experta dentro de 7 días.`;
  }
  
  if (summary.critical > 0) {
    // Si hay un riesgo crítico específico, mencionarlo
    if (topRiskTitle.includes('sin owner')) {
      return `Corregir los deals sin owner y bloquear su creación sin propietario, ya que es el riesgo con mayor impacto inmediato en la operación comercial.`;
    }
    if (topRiskTitle.includes('sin contacto')) {
      return `Asociar contactos a todos los deals huérfanos y bloquear creación de deals sin contacto, ya que esto bloquea completamente el seguimiento y nurturing automatizado.`;
    }
    if (topRiskTitle.includes('sin email')) {
      return `Auditar fuentes de captación y validar email obligatorio en todos los formularios, ya que contactos sin email bloquean email marketing y automatización.`;
    }
    if (topRiskTitle.includes('sin lifecycle')) {
      return `Implementar asignación automática de lifecycle stages en formularios y workflows, ya que esto invalida forecasting y reportes de pipeline.`;
    }
    if (topRiskTitle.includes('sin valor') || topRiskTitle.includes('sin precio')) {
      return `Obligar captura de amount en creación de deals y crear workflows de recordatorio, ya que deals sin precio invalidan forecasting financiero.`;
    }
    
    // Fallback genérico para critical
    return `Revisión experta prioritaria: riesgos operativos críticos detectados requieren evaluación profesional para diseñar plan de remediación. Se recomienda actuar dentro de 15 días.`;
  }
  
  if (summary.urgentCount >= 2) {
    return `Revisión experta prioritaria: múltiples oportunidades urgentes de optimización detectadas que afectan eficiencia operativa. Se recomienda actuar dentro de 15 días.`;
  }
  
  if (summary.warning >= 3) {
    return `Optimización guiada: múltiples oportunidades de mejora identificadas que pueden incrementar eficiencia operativa y ROI en licencias de HubSpot. Se recomienda revisión experta próximo mes.`;
  }

  // Sin riesgos críticos ni warnings importantes
  return null; // No mostrar bloque de acción prioritaria
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
