import axios from 'axios';
import { refreshPortalToken } from '../hubspot/refreshToken.service.js';

/**
 * Analiza workflows de Marketing Hub
 * @param {number} portalId - ID del portal de HubSpot
 * @param {object} fastify - Instancia de Fastify (para DB)
 * @returns {object} Análisis completo de workflows
 */
export async function analyzeWorkflows(portalId, fastify) {
  try {
    console.log(`🔍 [Workflows] Analizando workflows para portal ${portalId}...`);

    // 1. Obtener token actualizado
    console.log(`🔑 [Workflows] Obteniendo token para portal ${portalId}...`);
    const accessToken = await refreshPortalToken(fastify, portalId);
    
    if (!accessToken) {
      throw new Error('No se pudo obtener token de acceso. ¿La app está instalada?');
    }
    
    console.log(`✅ [Workflows] Token obtenido exitosamente`);

    // 2. Fetch workflows desde HubSpot
    const workflows = await fetchAllWorkflows(accessToken);
    console.log(`📊 [Workflows] ${workflows.length} workflows obtenidos`);

    // 3. Analizar workflows
    const analysis = {
      overview: calculateOverview(workflows),
      sinUso: detectWorkflowsSinUso(workflows),
      conErrores: detectWorkflowsConErrores(workflows),
      obsoletos: detectWorkflowsObsoletos(workflows),
      sinGoals: detectWorkflowsSinGoals(workflows),
      score: 0 // Se calcula después
    };

    // 4. Calcular score
    analysis.score = calculateWorkflowsScore(workflows, analysis);

    console.log(`✅ [Workflows] Análisis completado. Score: ${analysis.score}/100`);
    return analysis;

  } catch (error) {
    console.error('❌ [Workflows] Error analizando workflows:', error);
    throw error;
  }
}

/**
 * Fetch todos los workflows (con paginación)
 */
async function fetchAllWorkflows(accessToken) {
  try {
    console.log(`📡 [Workflows] Llamando a HubSpot API (automation/v4/flows)...`);
    
    const response = await axios.get(
      'https://api.hubapi.com/automation/v4/flows',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          limit: 100
        }
      }
    );

    console.log(`✅ [Workflows] Respuesta recibida de HubSpot API`);
    const raw = response.data.results || response.data.workflows || response.data || [];
    return Array.isArray(raw) ? raw : [];

  } catch (error) {
    console.error('❌ [Workflows] Error fetching workflows from HubSpot:');
    console.error('   Status:', error.response?.status);
    console.error('   Data:', error.response?.data);
    console.error('   Message:', error.message);
    
    // Error específico de permisos
    if (error.response?.status === 403) {
      throw new Error('Permisos insuficientes. Verifica que la app tenga el scope "automation"');
    }
    
    // Error específico de token inválido
    if (error.response?.status === 401) {
      throw new Error('Token de acceso inválido o expirado. Reinstala la app.');
    }
    
    throw new Error(`Error al obtener workflows de HubSpot: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Calcula overview general
 */
function isEnabled(w) {
  return w.enabled === true || w.isEnabled === true;
}

function toTimestamp(val) {
  if (!val) return 0;
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  const t = new Date(val).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function calculateOverview(workflows) {
  const total = workflows.length;
  const activos = workflows.filter(w => isEnabled(w)).length;
  const inactivos = total - activos;

  return {
    total,
    activos,
    inactivos,
    porcentajeActivo: total > 0 ? Math.round((activos / total) * 100) : 0
  };
}

/**
 * Detecta workflows sin enrollments (no se usan)
 */
function detectWorkflowsSinUso(workflows) {
  const threshold = 90; // días sin uso
  const now = Date.now();

  const sinUso = workflows.filter(w => {
    if (!isEnabled(w)) return false;

    const enrollmentTotal = w.enrollmentCounts?.total || 0;
    const lastExecuted = toTimestamp(w.lastExecutedAt || w.updatedAt || w.insertedAt || w.createdAt);
    const daysSinceUse = lastExecuted
      ? Math.floor((now - lastExecuted) / (1000 * 60 * 60 * 24))
      : 999;

    return enrollmentTotal === 0 || daysSinceUse > threshold;
  }).map(w => {
    const lastExecuted = toTimestamp(w.lastExecutedAt || w.updatedAt || w.insertedAt || w.createdAt);
    const daysSinceUse = lastExecuted
      ? Math.floor((now - lastExecuted) / (1000 * 60 * 60 * 24))
      : 999;
    return {
      id: w.id,
      name: w.name,
      enabled: isEnabled(w),
      enrollments: w.enrollmentCounts?.total || 0,
      lastExecuted: lastExecuted || null,
      daysSinceUse
    };
  });

  return {
    workflows: sinUso,
    total: sinUso.length,
    costoEstimado: sinUso.length * 5 // $5 por workflow sin uso
  };
}

/**
 * Detecta workflows con errores
 */
function detectWorkflowsConErrores(workflows) {
  // La API v4 no siempre devuelve errores explícitamente
  // Buscamos workflows activos que no se hayan ejecutado recientemente
  const conErrores = workflows.filter(w => {
    return isEnabled(w) && w.hasErrors === true;
  });

  return {
    workflows: conErrores.map(w => ({
      id: w.id,
      name: w.name,
      enabled: isEnabled(w),
      errorType: 'ERROR_DETECTED',
      lastError: w.lastExecutedAt || w.updatedAt
    })),
    total: conErrores.length
  };
}

/**
 * Detecta workflows obsoletos (sin actualizar en 180+ días)
 */
function detectWorkflowsObsoletos(workflows) {
  const threshold = 180; // días
  const now = Date.now();

  const obsoletos = workflows.filter(w => {
    if (!isEnabled(w)) return false;

    const updatedAt = toTimestamp(w.updatedAt || w.insertedAt || w.createdAt);
    if (!updatedAt) return true;
    const daysSinceUpdate = Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24));
    return daysSinceUpdate > threshold;
  }).map(w => {
    const updatedAt = toTimestamp(w.updatedAt || w.insertedAt || w.createdAt) || now;
    return {
      id: w.id,
      name: w.name,
      lastUpdated: new Date(updatedAt).toISOString().split('T')[0],
      daysSinceUpdate: Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24))
    };
  });

  return {
    workflows: obsoletos,
    total: obsoletos.length
  };
}

/**
 * Detecta workflows sin objetivos configurados
 */
function detectWorkflowsSinGoals(workflows) {
  const sinGoals = workflows.filter(w => {
    if (!isEnabled(w)) return false;

    const hasGoal = w.goalCriteria && w.goalCriteria.isEnabled === true;
    return !hasGoal;
  }).map(w => ({
    id: w.id,
    name: w.name,
    enrollments: w.enrollmentCounts?.total || 0
  }));

  return {
    workflows: sinGoals,
    total: sinGoals.length
  };
}

/**
 * Calcula score de salud de workflows (0-100)
 */
function calculateWorkflowsScore(workflows, analysis) {
  let score = 100;
  const total = workflows.length;

  if (total === 0) return 0;

  const activos = workflows.filter(w => isEnabled(w)).length;
  if (activos === 0) {
    return Math.max(0, Math.round(100 - ((total - activos) / total) * 100 * 0.3));
  }

  // Penalizaciones
  const percentageInactive = ((total - activos) / total) * 100;
  score -= percentageInactive * 0.3; // -30% por workflows inactivos

  // Workflows sin uso (solo sobre activos)
  const sinUsoPercentage = (analysis.sinUso.total / activos) * 100;
  score -= Math.min(sinUsoPercentage * 0.5, 20); // Max -20 pts

  // Workflows con errores (crítico)
  score -= Math.min(analysis.conErrores.total * 10, 30); // -10 pts cada uno (max -30)

  // Workflows obsoletos
  const obsoletosPercentage = (analysis.obsoletos.total / activos) * 100;
  score -= Math.min(obsoletosPercentage * 0.3, 15); // Max -15 pts

  // Workflows sin goals
  const sinGoalsPercentage = (analysis.sinGoals.total / activos) * 100;
  score -= Math.min(sinGoalsPercentage * 0.2, 10); // Max -10 pts

  return Math.max(Math.round(score), 0);
}

