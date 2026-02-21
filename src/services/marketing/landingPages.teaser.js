/**
 * Landing Pages Teaser - Máx 50 páginas, solo metadata.
 * No descarga HTML.
 */
import axios from 'axios';
import { refreshPortalToken } from '../hubspot/refreshToken.service.js';

const MAX_PAGES = 50;
const DAYS_STALE = 180;
const DAYS_NO_VIEWS = 90;
const MS_STALE = DAYS_STALE * 24 * 60 * 60 * 1000;
const MS_NO_VIEWS = DAYS_NO_VIEWS * 24 * 60 * 60 * 1000;

export async function analyzeLandingPagesTeaser(portalId, fastify) {
  const accessToken = await refreshPortalToken(fastify, portalId);
  if (!accessToken) throw new Error('No se pudo obtener token de acceso.');

  let pages = [];
  try {
    const res = await axios.get('https://api.hubapi.com/cms/v3/pages/landing-pages', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit: MAX_PAGES, archived: false },
      timeout: 15000,
    });
    pages = res.data.results || [];
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 401) {
      return buildUnavailable(err.response?.status);
    }
    throw err;
  }

  const now = Date.now();
  const sinActualizacion = pages.filter((p) => {
    const updated = p.updatedAt || p.updated || p.lastUpdated;
    if (!updated) return true;
    return now - new Date(updated).getTime() > MS_STALE;
  });
  const sinFormularios = pages.filter((p) => !p.widgetContainers?.length && !p.meta?.hasForm);
  const sinMetaDesc = pages.filter((p) => !p.metaDescription || String(p.metaDescription).trim() === '');
  const sinViews90 = pages.filter((p) => {
    const views = p.meta?.views ?? p.views;
    const lastView = p.meta?.lastViewedAt ?? p.lastViewedAt;
    if (lastView) return now - new Date(lastView).getTime() > MS_NO_VIEWS;
    return views != null && views === 0;
  });

  const total = Math.min(pages.length, MAX_PAGES);
  const insights = [];
  if (sinActualizacion.length > 0) insights.push({ id: 'stale', title: `${sinActualizacion.length} páginas sin actualización en ${DAYS_STALE}+ días`, severity: 'warning' });
  if (sinFormularios.length > 0) insights.push({ id: 'no-form', title: `${sinFormularios.length} páginas sin formularios embebidos`, severity: 'info' });
  if (sinMetaDesc.length > 0) insights.push({ id: 'no-meta', title: `${sinMetaDesc.length} páginas sin meta description`, severity: 'info' });
  if (sinViews90.length > 0) insights.push({ id: 'no-views', title: `${sinViews90.length} páginas sin views en ${DAYS_NO_VIEWS}+ días`, severity: 'warning' });
  const score = computeScore(total, [sinActualizacion.length, sinFormularios.length, sinMetaDesc.length, sinViews90.length]);

  return {
    score: Math.min(100, Math.max(0, score)),
    total,
    sinActualizacion: sinActualizacion.length,
    sinFormularios: sinFormularios.length,
    sinMetaDesc: sinMetaDesc.length,
    sinViews90: sinViews90.length,
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
    insights: [{ id: 'unavailable', title: `No disponible (permisos o scope). Código: ${status}`, severity: 'warning' }],
    level: 'rojo',
    unavailable: true,
  };
}
