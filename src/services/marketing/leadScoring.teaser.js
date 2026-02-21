/**
 * Lead Scoring Teaser - Diagnóstico básico.
 * No analiza cada contacto; solo métricas agregadas (properties + búsqueda ligera).
 */
import axios from 'axios';
import { refreshPortalToken } from '../hubspot/refreshToken.service.js';

const SCORE_PROPERTY_NAMES = ['hs_lead_status', 'hs_lead_score', 'hubspotscore', 'lead_score', 'hs_analytics_source'];

export async function analyzeLeadScoringTeaser(portalId, fastify) {
  const accessToken = await refreshPortalToken(fastify, portalId);
  if (!accessToken) throw new Error('No se pudo obtener token de acceso.');

  const auth = { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 12000 };

  let hasScoring = false;
  let scorePropertyName = null;
  let scorePropertyInternal = null;
  let totalContacts = 0;
  let contactsWithoutScore = 0;

  try {
    const propsRes = await axios.get('https://api.hubapi.com/crm/v3/properties/contacts', { ...auth, params: { limit: 200 } });
    const props = propsRes.data.results || [];
    const scoreProp = props.find((p) => SCORE_PROPERTY_NAMES.includes(p.name) || (p.name && p.name.toLowerCase().includes('score')));
    if (scoreProp) {
      hasScoring = true;
      scorePropertyName = scoreProp.label || scoreProp.name;
      scorePropertyInternal = scoreProp.name;
    }
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 401) {
      return buildUnavailable(err.response?.status);
    }
    throw err;
  }

  if (hasScoring && scorePropertyInternal) {
    try {
      const searchTotal = await axios.post(
        'https://api.hubapi.com/crm/v3/objects/contacts/search',
        { limit: 1, properties: ['hs_object_id'], filterGroups: [] },
        auth
      );
      totalContacts = searchTotal.data.total ?? 0;
      const searchNoScore = await axios.post(
        'https://api.hubapi.com/crm/v3/objects/contacts/search',
        {
          limit: 1,
          properties: ['hs_object_id'],
          filterGroups: [{ filters: [{ propertyName: scorePropertyInternal, operator: 'NOT_HAS_PROPERTY' }] }],
        },
        auth
      );
      contactsWithoutScore = searchNoScore.data.total ?? 0;
    } catch (e) {
      totalContacts = 0;
      contactsWithoutScore = 0;
    }
  }

  const pctSinScore = totalContacts > 0 ? Math.round((contactsWithoutScore / totalContacts) * 100) : 0;
  const insights = [];
  if (!hasScoring) {
    insights.push({ id: 'no-scoring', title: 'No se detectó un modelo de lead scoring configurado', severity: 'warning' });
  } else {
    if (contactsWithoutScore > 0) insights.push({ id: 'without-score', title: `${contactsWithoutScore} contactos sin score (${pctSinScore}%)`, severity: pctSinScore > 50 ? 'warning' : 'info' });
    insights.push({ id: 'configured', title: `Scoring configurado (${scorePropertyName})`, severity: 'info' });
  }
  const score = hasScoring ? Math.max(0, 100 - pctSinScore * 0.5) : 30;
  return {
    score: Math.round(Math.min(100, score)),
    hasScoring,
    scorePropertyName: scorePropertyName || null,
    totalContacts,
    contactsWithoutScore,
    pctSinScore,
    insights: insights.slice(0, 3),
    level: score >= 86 ? 'verde' : score >= 66 ? 'amarillo' : 'rojo',
  };
}

function buildUnavailable(status) {
  return {
    score: 0,
    hasScoring: false,
    totalContacts: 0,
    contactsWithoutScore: 0,
    pctSinScore: 0,
    insights: [{ id: 'unavailable', title: `No disponible (permisos). Código: ${status}`, severity: 'warning' }],
    level: 'rojo',
    unavailable: true,
  };
}
