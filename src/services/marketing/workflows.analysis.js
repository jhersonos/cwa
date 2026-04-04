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
 * Extrae el array de flows/workflows del body de HubSpot (v4 tiene varias formas).
 */
function extractFlowsBatch(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const batch =
    data.results ||
    data.workflows ||
    data.flows ||
    data.objects;
  return Array.isArray(batch) ? batch : [];
}

/**
 * GET /automation/v4/flows con paginación por cursor (after).
 */
async function fetchFlowsV4Paginated(accessToken) {
  const all = [];
  let after = undefined;
  const maxPages = 50;

  for (let page = 0; page < maxPages; page++) {
    const response = await axios.get(
      'https://api.hubapi.com/automation/v4/flows',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          limit: 100,
          ...(after ? { after } : {})
        },
        timeout: 30000
      }
    );

    const data = response.data;
    const batch = extractFlowsBatch(data);
    all.push(...batch);

    const nextAfter = data?.paging?.next?.after;
    if (!nextAfter) break;
    after = nextAfter;
  }

  return all;
}

/**
 * GET /automation/v3/workflows (misma estrategia que scan CRM) — fallback si v4 falla.
 */
async function fetchWorkflowsV3Paginated(accessToken) {
  const all = [];
  let after = undefined;
  const maxPages = 50;

  for (let page = 0; page < maxPages; page++) {
    const response = await axios.get(
      'https://api.hubapi.com/automation/v3/workflows',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params: {
          limit: 100,
          ...(after ? { after } : {})
        },
        timeout: 30000
      }
    );

    const data = response.data;
    const batch = Array.isArray(data?.results) ? data.results : extractFlowsBatch(data);
    all.push(...batch);

    const nextAfter = data?.paging?.next?.after;
    if (!nextAfter) break;
    after = nextAfter;
  }

  return all;
}

function isAuthError(status) {
  return status === 401 || status === 403;
}

/**
 * Fetch todos los workflows: intenta v4, si falla usa v3 (portales donde v4 no responde bien).
 */
async function fetchAllWorkflows(accessToken) {
  try {
    console.log(`📡 [Workflows] Llamando a HubSpot API (automation/v4/flows)...`);
    const flows = await fetchFlowsV4Paginated(accessToken);
    console.log(`✅ [Workflows] v4: ${flows.length} workflows`);
    return flows;
  } catch (error) {
    const status = error.response?.status;
    console.error('❌ [Workflows] v4 flows:', status, error.response?.data || error.message);

    if (isAuthError(status)) {
      if (status === 403) {
        throw new Error('Permisos insuficientes. Verifica que la app tenga el scope "automation"');
      }
      throw new Error('Token de acceso inválido o expirado. Reinstala la app.');
    }

    console.log(`📡 [Workflows] Fallback: automation/v3/workflows...`);
    try {
      const workflows = await fetchWorkflowsV3Paginated(accessToken);
      console.log(`✅ [Workflows] v3: ${workflows.length} workflows`);
      return workflows;
    } catch (fallbackErr) {
      const st = fallbackErr.response?.status;
      console.error('❌ [Workflows] v3 workflows:', st, fallbackErr.response?.data || fallbackErr.message);
      if (isAuthError(st)) {
        if (st === 403) {
          throw new Error('Permisos insuficientes. Verifica que la app tenga el scope "automation"');
        }
        throw new Error('Token de acceso inválido o expirado. Reinstala la app.');
      }
      const msg =
        fallbackErr.response?.data?.message ||
        error.response?.data?.message ||
        fallbackErr.message ||
        error.message;
      throw new Error(`Error al obtener workflows de HubSpot: ${msg}`);
    }
  }
}

/**
 * Calcula overview general
 */
function isEnabled(w) {
  if (!w) return false;
  if (w.enabled === true || w.isEnabled === true) return true;
  // API v3 (automation/v3/workflows)
  if (w.state === 'ACTIVE') return true;
  return false;
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

    const hasGoal =
      w.goalCriteria &&
      typeof w.goalCriteria === 'object' &&
      w.goalCriteria.isEnabled === true;
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

