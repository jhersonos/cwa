/**
 * Lists Teaser - Extensión ligera: metadata only, máx 50 listas.
 * Sin uso 90 días, filtros vacíos, duplicados por nombre similar.
 */
import axios from 'axios';
import { refreshPortalToken } from '../hubspot/refreshToken.service.js';

const MAX_LISTS = 50;
const DAYS_NO_USE = 90;
const MS_90 = DAYS_NO_USE * 24 * 60 * 60 * 1000;

function normalize(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function similar(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.length < 5 || nb.length < 5) return false;
  return na.includes(nb) || nb.includes(na) || na.split(' ').some((w) => w.length > 3 && nb.includes(w));
}

export async function analyzeListsTeaser(portalId, fastify) {
  const accessToken = await refreshPortalToken(fastify, portalId);
  if (!accessToken) throw new Error('No se pudo obtener token de acceso.');

  let lists = [];
  try {
    const res = await axios.get('https://api.hubapi.com/crm/v3/lists', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { count: MAX_LISTS },
      timeout: 12000,
    });
    lists = res.data.lists || [];
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 401) {
      return buildUnavailable(err.response?.status);
    }
    throw err;
  }

  const now = Date.now();
  const sinUso90 = lists.filter((l) => {
    const updated = l.updatedAt || l.updated || l.lastUpdated;
    if (!updated) return true;
    return now - new Date(updated).getTime() > MS_90;
  });
  const filtrosVacios = lists.filter((l) => {
    const f = l.filterBranch || l.filters;
    return !f || (Array.isArray(f) && f.length === 0) || (typeof f === 'object' && Object.keys(f).length === 0);
  });
  const names = lists.map((l) => l.name || '');
  const duplicados = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (similar(names[i], names[j])) duplicados.push(names[i]);
    }
  }
  const duplicadosUnicos = [...new Set(duplicados)].length;

  const total = Math.min(lists.length, MAX_LISTS);
  const insights = [];
  if (sinUso90.length > 0) insights.push({ id: 'no-use', title: `${sinUso90.length} listas sin uso en ${DAYS_NO_USE}+ días`, severity: 'warning' });
  if (filtrosVacios.length > 0) insights.push({ id: 'empty-filters', title: `${filtrosVacios.length} listas con filtros vacíos`, severity: 'info' });
  if (duplicadosUnicos > 0) insights.push({ id: 'duplicates', title: `${duplicadosUnicos} listas con nombre similar (posible duplicado)`, severity: 'info' });
  const score = computeScore(total, [sinUso90.length, filtrosVacios.length, duplicadosUnicos]);

  return {
    score: Math.min(100, Math.max(0, score)),
    total,
    sinUso90: sinUso90.length,
    filtrosVacios: filtrosVacios.length,
    duplicados: duplicadosUnicos,
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

function buildUnavailable(status) {
  return {
    score: 0,
    total: 0,
    insights: [{ id: 'unavailable', title: `No disponible (permisos). Código: ${status}`, severity: 'warning' }],
    level: 'rojo',
    unavailable: true,
  };
}
