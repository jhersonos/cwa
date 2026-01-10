/**
 * INSIGHTS GENERATOR V3 - AUDITOR SENIOR
 * 
 * Convierte datos del CRM en diagnóstico accionable de riesgos operativos
 * Enfoque: Gobernanza, eficiencia comercial y adopción real de herramientas
 */

export function generateInsights({ efficiency, contacts, users, deals, companies, tools }) {
  const insights = [];

  /* ====================================
     ANÁLISIS DE CONTACTOS
  ==================================== */

  // Contactos sin email - CRÍTICO
  if (contacts.total > 0 && contacts.withoutEmail > 0) {
    const percentage = ((contacts.withoutEmail / contacts.total) * 100).toFixed(1);
    
    if (percentage > 20) {
      insights.push({
        id: "contacts-no-email-critical",
        severity: "critical",
        urgency: "alta",
        title: `${percentage}% de contactos sin email (detectado en muestra de ${contacts.total})`,
        description: `Este patrón, detectado en la muestra analizada, indica que ${percentage}% de tu base de contactos no tiene email, bloqueando completamente email marketing, nurturing automatizado y seguimiento comercial efectivo.`,
        businessImpact: "Bloquea campañas de email, workflows automatizados y reduce dramáticamente las oportunidades de conversión. Los contactos sin email son prácticamente invisibles para tu estrategia de marketing.",
        recommendation: "1) Audita fuentes de captación sin validación de email. 2) Implementa formularios con email obligatorio. 3) Considera enriquecimiento de datos con herramientas como Clearbit o ZoomInfo.",
        relatedModule: "contacts"
      });
    } else if (percentage > 10) {
      insights.push({
        id: "contacts-no-email-warning",
        severity: "warning",
        urgency: "media",
        title: `${percentage}% de contactos sin email (muestra: ${contacts.total})`,
        description: `Patrón detectado en muestra: ${contacts.withoutEmail} contactos no tienen email registrado, limitando alcance de automatización y seguimiento.`,
        businessImpact: "Reduce efectividad de campañas y workflows. Afecta scoring y segmentación de leads.",
        recommendation: "Revisa procesos de captura de leads y asegura validación de email en todos los puntos de entrada.",
        relatedModule: "contacts"
      });
    }
  }

  // Contactos sin teléfono
  if (contacts.total > 0 && contacts.withoutPhone > 0) {
    const percentage = ((contacts.withoutPhone / contacts.total) * 100).toFixed(1);
    
    if (percentage > 30) {
      insights.push({
        id: "contacts-no-phone",
        severity: "warning",
        urgency: "media",
        title: `${contacts.withoutPhone} contactos sin teléfono (${percentage}%)`,
        description: `${percentage}% de contactos no tienen teléfono, limitando capacidad de prospección telefónica y seguimiento directo.`,
        businessImpact: "Reduce efectividad de equipos de SDR/BDR. Limita opciones de contact rate y velocidad de respuesta en deals calientes.",
        recommendation: "Enriquece datos mediante formularios con teléfono opcional o herramientas de data enrichment. Considera calling campaigns solo para segmentos con teléfono validado.",
        relatedModule: "contacts"
      });
    }
  }

  // Contactos sin lifecycle - CRÍTICO
  if (contacts.total > 0 && contacts.withoutLifecycle > 0) {
    const percentage = ((contacts.withoutLifecycle / contacts.total) * 100).toFixed(1);
    
    if (percentage > 20) {
      insights.push({
        id: "contacts-no-lifecycle-critical",
        severity: "critical",
        urgency: "alta",
        title: `${contacts.withoutLifecycle} contactos sin lifecycle stage (${percentage}%)`,
        description: `${percentage}% de contactos no tienen lifecycle stage, destruyendo la gobernanza del funnel y haciendo imposible un reporting confiable.`,
        businessImpact: "Invalida forecasting, reportes de pipeline y análisis de conversión. Genera decisiones de negocio basadas en datos incompletos o incorrectos.",
        recommendation: "1) Asigna lifecycle stages por defecto en formularios. 2) Crea workflows de asignación automática basados en comportamiento. 3) Audita fuentes de contactos sin lifecycle.",
        relatedModule: "contacts"
      });
    } else if (percentage > 10) {
      insights.push({
        id: "contacts-no-lifecycle-warning",
        severity: "warning",
        urgency: "media",
        title: `${contacts.withoutLifecycle} contactos sin lifecycle stage (${percentage}%)`,
        description: `${contacts.withoutLifecycle} contactos no tienen lifecycle stage asignado.`,
        businessImpact: "Afecta precisión de reportes de funnel y dificulta segmentación efectiva.",
        recommendation: "Implementa reglas automáticas de asignación de lifecycle en workflows o formularios.",
        relatedModule: "contacts"
      });
    }
  }

  // Contactos obsoletos - CRÍTICO
  if (contacts.total > 0 && contacts.stale > 0) {
    const percentage = ((contacts.stale / contacts.total) * 100).toFixed(1);
    
    if (percentage > 25) {
      insights.push({
        id: "contacts-stale-critical",
        severity: "critical",
        urgency: "media",
        title: `${contacts.stale} contactos obsoletos >6 meses (${percentage}%)`,
        description: `${percentage}% de contactos llevan más de 6 meses sin actividad ni actualización, generando clutter masivo y afectando costos de almacenamiento.`,
        businessImpact: "Infla artificialmente métricas de base de datos. Reduce deliverability de emails. Consume recursos de almacenamiento y licencias innecesariamente.",
        recommendation: "1) Crea proceso de revisión trimestral de contactos inactivos. 2) Implementa campañas de reactivación automatizadas. 3) Archiva contactos sin engagement después de 12 meses.",
        relatedModule: "contacts"
      });
    } else if (percentage > 15) {
      insights.push({
        id: "contacts-stale-warning",
        severity: "warning",
        urgency: "baja",
        title: `${contacts.stale} contactos obsoletos >6 meses (${percentage}%)`,
        description: `${contacts.stale} contactos no han sido actualizados en más de 6 meses.`,
        businessImpact: "Reduce calidad de base de datos y puede afectar deliverability de campañas.",
        recommendation: "Establece proceso de limpieza periódica o campañas de reengagement para contactos fríos.",
        relatedModule: "contacts"
      });
    }
  }

  /* ====================================
     ANÁLISIS DE USUARIOS
  ==================================== */

  if (users.total > 0 && users.inactive > 0) {
    const percentage = ((users.inactive / users.total) * 100).toFixed(1);
    
    if (percentage > 20) {
      insights.push({
        id: "users-inactive-critical",
        severity: "critical",
        urgency: "alta",
        title: `${users.inactive} usuarios inactivos (${percentage}%) consumiendo licencias`,
        description: `${percentage}% de usuarios están inactivos pero continúan consumiendo licencias pagas, generando costo directo sin valor.`,
        businessImpact: "Costo directo mensual en licencias sin uso. Además, usuarios inactivos pueden tener asignados deals/contacts bloqueando reasignación efectiva.",
        recommendation: "1) Revoca acceso de usuarios inactivos inmediatamente. 2) Reasigna deals y contactos antes de desactivar. 3) Implementa revisión trimestral de usuarios activos vs licencias.",
        relatedModule: "users"
      });
    } else if (users.inactive > 0) {
      insights.push({
        id: "users-inactive-warning",
        severity: "warning",
        urgency: "media",
        title: `${users.inactive} usuarios inactivos detectados`,
        description: `${users.inactive} usuarios aparecen como inactivos pero mantienen licencias asignadas.`,
        businessImpact: "Desperdicio de licencias pagas y posible bloqueo de reasignación de registros.",
        recommendation: "Desactiva usuarios innecesarios y reasigna sus registros a owners activos.",
        relatedModule: "users"
      });
    }
  }

  /* ====================================
     ANÁLISIS DE DEALS
  ==================================== */

  if (deals && deals.total > 0) {
    // Deals sin contacto - CRÍTICO
    if (deals.withoutContact && deals.withoutContact.count > 0) {
      const percentage = deals.withoutContact.percentage;
      
      if (percentage > 15) {
        insights.push({
          id: "deals-no-contact-critical",
          severity: "critical",
          urgency: "alta",
          title: `${percentage}% de deals sin contacto (detectado en muestra de ${deals.total})`,
          description: `Este patrón crítico detectado en la muestra indica que ${percentage}% de deals no tienen contacto asociado, creando deals huérfanos imposibles de gestionar efectivamente.`,
          businessImpact: "Deals sin contacto bloquean comunicación, seguimiento y nurturing automatizado. Genera pérdida directa de oportunidades por falta de contexto del lead.",
          recommendation: "1) Bloquea creación de deals sin contacto mediante validaciones. 2) Crea workflow de alerta para deals huérfanos. 3) Audita deals existentes y asocia contactos manualmente.",
          relatedModule: "deals"
        });
      } else if (percentage > 5) {
        insights.push({
          id: "deals-no-contact-warning",
          severity: "warning",
          urgency: "alta",
          title: `${deals.withoutContact.count} deals sin contacto asociado (${percentage}%)`,
          description: `${deals.withoutContact.count} deals no tienen contacto vinculado, dificultando seguimiento y contexto.`,
          businessImpact: "Afecta capacidad de follow-up efectivo y visibilidad de relación con el lead.",
          recommendation: "Establece regla de negocio: todo deal requiere al menos un contacto asociado.",
          relatedModule: "deals"
        });
      }
    }

    // Deals sin owner - CRÍTICO
    if (deals.withoutOwner && deals.withoutOwner.count > 0) {
      const percentage = deals.withoutOwner.percentage;
      
      if (percentage > 10) {
        insights.push({
          id: "deals-no-owner-critical",
          severity: "critical",
          urgency: "alta",
          title: `${deals.withoutOwner.count} deals sin owner asignado (${percentage}%)`,
          description: `${percentage}% de deals no tienen propietario, destruyendo accountability y seguimiento comercial.`,
          businessImpact: "Deals sin owner se pierden en el limbo. Nadie hace seguimiento, nadie es responsable. Pérdida directa de ingresos por oportunidades abandonadas.",
          recommendation: "1) Asigna owners automáticamente mediante round-robin en formularios/workflows. 2) Audita deals sin owner semanalmente. 3) Implementa SLA de asignación (máximo 24h sin owner).",
          relatedModule: "deals"
        });
      } else if (percentage > 5) {
        insights.push({
          id: "deals-no-owner-warning",
          severity: "warning",
          urgency: "alta",
          title: `${deals.withoutOwner.count} deals sin owner asignado (${percentage}%)`,
          description: `${deals.withoutOwner.count} deals no tienen responsable asignado.`,
          businessImpact: "Afecta accountability, forecast y seguimiento estructurado de oportunidades.",
          recommendation: "Implementa asignación automática de owners o rutas de distribución de leads.",
          relatedModule: "deals"
        });
      }
    }

    // Deals sin precio
    if (deals.withoutPrice && deals.withoutPrice.count > 0) {
      const percentage = deals.withoutPrice.percentage;
      
      if (percentage > 20) {
        insights.push({
          id: "deals-no-amount-critical",
          severity: "critical",
          urgency: "media",
          title: `${deals.withoutPrice.count} deals sin valor monetario (${percentage}%)`,
          description: `${percentage}% de deals no tienen amount definido, invalidando completamente forecasting y reporting financiero.`,
          businessImpact: "Forecasting inútil. Reportes de pipeline sin valor real. Imposibilita análisis de ROI y proyecciones de ingresos confiables.",
          recommendation: "1) Obliga captura de amount en creación de deals. 2) Crea workflow de recordatorio para deals sin precio después de 48h. 3) Entrena equipo en estimación de deal size.",
          relatedModule: "deals"
        });
      } else if (percentage > 10) {
        insights.push({
          id: "deals-no-amount-warning",
          severity: "warning",
          urgency: "media",
          title: `${deals.withoutPrice.count} deals sin valor monetario (${percentage}%)`,
          description: `${deals.withoutPrice.count} deals no tienen monto estimado.`,
          businessImpact: "Afecta precisión de forecasts y análisis de pipeline value.",
          recommendation: "Implementa validación de amount obligatorio o al menos amount estimado basado en promedios.",
          relatedModule: "deals"
        });
      }
    }

    // Deals inactivos
    if (deals.inactive && deals.inactive.count > 0) {
      const percentage = deals.inactive.percentage;
      
      if (percentage > 30) {
        insights.push({
          id: "deals-inactive-critical",
          severity: "critical",
          urgency: "media",
          title: `${deals.inactive.count} deals inactivos >3 meses (${percentage}%)`,
          description: `${percentage}% de deals llevan más de 3 meses sin actividad, señalando pipeline estancado y falta de seguimiento.`,
          businessImpact: "Pipeline inflado artificialmente. Forecast poco confiable. Oportunidades reales perdidas por falta de follow-up estructurado.",
          recommendation: "1) Cierra deals muertos (won/lost) para limpiar pipeline. 2) Implementa recordatorios automáticos de follow-up cada 2 semanas. 3) Revisa causas de estancamiento con equipo comercial.",
          relatedModule: "deals"
        });
      } else if (percentage > 15) {
        insights.push({
          id: "deals-inactive-warning",
          severity: "warning",
          urgency: "baja",
          title: `${deals.inactive.count} deals inactivos >3 meses (${percentage}%)`,
          description: `${deals.inactive.count} deals no han tenido actividad en más de 3 meses.`,
          businessImpact: "Reduce confiabilidad de pipeline y puede indicar falta de disciplina en seguimiento comercial.",
          recommendation: "Establece proceso de revisión mensual de deals estancados y cierra deals muertos.",
          relatedModule: "deals"
        });
      }
    }
  }

  /* ====================================
     ANÁLISIS DE COMPANIES
  ==================================== */

  if (companies && companies.total > 0) {
    // Companies sin dominio
    if (companies.withoutDomain && companies.withoutDomain.count > 0) {
      const percentage = companies.withoutDomain.percentage;
      
      if (percentage > 30) {
        insights.push({
          id: "companies-no-domain",
          severity: "warning",
          urgency: "baja",
          title: `${companies.withoutDomain.count} empresas sin dominio web (${percentage}%)`,
          description: `${percentage}% de empresas no tienen dominio registrado, limitando enriquecimiento automático de datos.`,
          businessImpact: "Pierde oportunidades de data enrichment automático con herramientas como Clearbit. Dificulta investigación previa y contextualización de cuentas.",
          recommendation: "Captura dominio web en formularios de empresas y considera enriquecimiento con APIs externas.",
          relatedModule: "companies"
        });
      }
    }

    // Companies sin owner
    if (companies.withoutOwner && companies.withoutOwner.count > 0) {
      const percentage = companies.withoutOwner.percentage;
      
      if (percentage > 20) {
        insights.push({
          id: "companies-no-owner",
          severity: "warning",
          urgency: "media",
          title: `${companies.withoutOwner.count} empresas sin owner (${percentage}%)`,
          description: `${percentage}% de empresas no tienen owner asignado, afectando accountability en cuentas B2B.`,
          businessImpact: "En estrategias ABM, empresas sin owner pierden seguimiento estructurado y oportunidades de cross-sell/up-sell.",
          recommendation: "Asigna owners automáticamente al crear empresas, especialmente en modelos B2B.",
          relatedModule: "companies"
        });
      }
    }

    // Companies inactivas
    if (companies.inactive && companies.inactive.count > 0) {
      const percentage = companies.inactive.percentage;
      
      if (percentage > 40) {
        insights.push({
          id: "companies-inactive",
          severity: "warning",
          urgency: "baja",
          title: `${companies.inactive.count} empresas inactivas >3 meses (${percentage}%)`,
          description: `${percentage}% de empresas no han tenido actividad reciente, señalando posible base de datos desactualizada.`,
          businessImpact: "Reduce efectividad de estrategias ABM y dificulta priorización de cuentas activas.",
          recommendation: "Implementa scoring de empresas basado en engagement y archiva cuentas inactivas después de 12 meses.",
          relatedModule: "companies"
        });
      }
    }
  }

  /* ====================================
     ANÁLISIS DE HERRAMIENTAS NO USADAS
  ==================================== */

  if (tools && tools.unused && tools.unused.length > 0) {
    const criticalTools = tools.unused.filter(t => 
      ['Deals', 'Workflows', 'Forms'].includes(t.tool)
    );

    if (criticalTools.length > 0) {
      const toolNames = criticalTools.map(t => t.tool).join(', ');
      
      insights.push({
        id: "tools-critical-unused",
        severity: "warning",
        urgency: "media",
        title: `Herramientas críticas sin usar: ${toolNames}`,
        description: `No estás utilizando ${toolNames}, herramientas esenciales para operación CRM efectiva.`,
        businessImpact: "Pérdida de ROI en licencias de HubSpot. Operación manual innecesaria. Falta de automatización reduce productividad del equipo.",
        recommendation: "Evalúa si estas herramientas son necesarias para tu operación. Si no las usas, considera downgrade de plan. Si deberías usarlas, capacita al equipo.",
        relatedModule: "tools"
      });
    } else if (tools.unused.length >= 3) {
      insights.push({
        id: "tools-unused-multiple",
        severity: "info",
        urgency: "baja",
        title: `${tools.unused.length} herramientas de HubSpot sin usar`,
        description: `Tienes ${tools.unused.length} módulos disponibles que no estás aprovechando.`,
        businessImpact: "Posible sub-utilización de licencias pagas. Oportunidades de automatización no explotadas.",
        recommendation: "Revisa si las herramientas no usadas pueden agregar valor a tu operación o considera ajustar tu plan.",
        relatedModule: "tools"
      });
    }
  }

  /* ====================================
     INSIGHT POSITIVO SI TODO ESTÁ BIEN
  ==================================== */

  if (insights.length === 0) {
    insights.push({
      id: "healthy-account",
      severity: "info",
      urgency: "baja",
      title: "Cuenta con buena gobernanza operativa",
      description: "No se detectaron riesgos críticos en la muestra analizada. La cuenta presenta indicadores saludables de higiene de datos y adopción de herramientas.",
      businessImpact: "Operación CRM estable que permite forecasting confiable y automatización efectiva.",
      recommendation: "Mantén disciplina en procesos de captura de datos y revisa periódicamente (cada trimestre) para detectar regresiones tempranas.",
      relatedModule: "global"
    });
  }

  return insights;
}
