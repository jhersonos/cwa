/**
 * Forms Teaser - Máx 50 formularios, solo metadata.
 * No descarga submissions.
 */
import axios from 'axios';
import { refreshPortalToken } from '../hubspot/refreshToken.service.js';

const MAX_FORMS = 50;
const MAX_FIELDS = 8;
const CONVERSION_THRESHOLD = 1;

export async function analyzeFormsTeaser(portalId, fastify) {
  const accessToken = await refreshPortalToken(fastify, portalId);
  if (!accessToken) throw new Error('No se pudo obtener token de acceso.');

  let forms = [];
  try {
    const res = await axios.get('https://api.hubapi.com/marketing/v3/forms/', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit: MAX_FORMS },
      timeout: 15000,
    });
    forms = res.data.results || [];
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 401) {
      return buildUnavailable('Forms', err.response?.status);
    }
    throw err;
  }

  const masDe8Campos = forms.filter((f) => {
    const n = (f.formFieldGroups && f.formFieldGroups.length) || 0;
    const fields = (f.formFieldGroups || []).reduce((acc, g) => acc + (g.fields?.length || 0), 0);
    return fields > MAX_FIELDS || n > MAX_FIELDS;
  });
  const sinWorkflows = forms.filter((f) => !f.associatedObjects?.length && !f.inlinedForms?.length);
  const conversionBaja = forms.filter((f) => {
    const rate = f.meta?.conversionRate ?? f.conversionRate;
    return rate != null && rate < CONVERSION_THRESHOLD;
  });

  const total = Math.min(forms.length, MAX_FORMS);
  const insights = [];
  if (masDe8Campos.length > 0) insights.push({ id: 'many-fields', title: `${masDe8Campos.length} formularios con más de ${MAX_FIELDS} campos`, severity: 'warning' });
  if (sinWorkflows.length > 0) insights.push({ id: 'no-workflows', title: `${sinWorkflows.length} formularios sin workflows asociados`, severity: 'warning' });
  if (conversionBaja.length > 0) insights.push({ id: 'low-conversion', title: `${conversionBaja.length} formularios con tasa estimada < ${CONVERSION_THRESHOLD}%`, severity: 'info' });
  const score = computeScore(total, [masDe8Campos.length, sinWorkflows.length, conversionBaja.length]);

  return {
    score: Math.min(100, Math.max(0, score)),
    total,
    masDe8Campos: masDe8Campos.length,
    sinWorkflows: sinWorkflows.length,
    conversionBaja: conversionBaja.length,
    insights: insights.slice(0, 3),
    level: score >= 86 ? 'verde' : score >= 66 ? 'amarillo' : 'rojo',
  };
}

function computeScore(total, counts) {
  if (total === 0) return 100;
  const totalIssues = counts.reduce((a, b) => a + b, 0);
  const ratio = totalIssues / (total * 2);
  return Math.round(100 - Math.min(ratio * 100, 100));
}

function buildUnavailable(module, status) {
  return {
    score: 0,
    total: 0,
    insights: [{ id: 'unavailable', title: `No disponible (permisos o scope). Código: ${status}`, severity: 'warning' }],
    level: 'rojo',
    unavailable: true,
  };
}
