/**
 * Emails Teaser - Máx 50 registros, solo metadata/agregados.
 * No descarga eventos individuales.
 */
import axios from 'axios';
import { refreshPortalToken } from '../hubspot/refreshToken.service.js';

const MAX_EMAILS = 50;
const OPEN_RATE_THRESHOLD = 15;
const DAYS_NO_SEND = 90;
const MS_90_DAYS = 90 * 24 * 60 * 60 * 1000;

export async function analyzeEmailsTeaser(portalId, fastify) {
  const accessToken = await refreshPortalToken(fastify, portalId);
  if (!accessToken) throw new Error('No se pudo obtener token de acceso.');

  let emails = [];
  try {
    try {
      const res = await axios.get('https://api.hubapi.com/marketing-emails/v1/emails/with-statistics', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { limit: MAX_EMAILS },
        timeout: 15000,
      });
      emails = res.data?.emails || res.data?.objects || res.data || [];
    } catch (e1) {
      if (e1.response?.status === 404 || e1.response?.status === 501) {
        const res2 = await axios.get('https://api.hubapi.com/marketing-emails/v1/emails', {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { limit: MAX_EMAILS },
          timeout: 15000,
        });
        emails = res2.data?.emails || res2.data?.objects || res2.data || [];
      } else throw e1;
    }
    if (!Array.isArray(emails)) emails = [];
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 401) {
      return buildUnavailable('Emails', err.response?.status);
    }
    throw err;
  }

  const now = Date.now();
  const sinEnvio90 = emails.filter((e) => {
    const lastSend = e.lastSendDate || e.updated || e.updatedAt;
    if (!lastSend) return true;
    return now - new Date(lastSend).getTime() > MS_90_DAYS;
  });
  const openRateBajo = emails.filter((e) => {
    const rate = e.openRate ?? e.meta?.openRate;
    return rate != null && rate < OPEN_RATE_THRESHOLD;
  });
  const sinCta = emails.filter((e) => {
    const body = (e.emailBody || e.body || '').toLowerCase();
    return body && body.length > 0 && !/cta|call to action|botón|button|href=/.test(body);
  });
  const sinAbTest = emails.filter((e) => !e.ab || !e.abVariation);

  const total = Math.min(emails.length, MAX_EMAILS);
  const insights = [];
  if (sinEnvio90.length > 0) insights.push({ id: 'no-send-90', title: `${sinEnvio90.length} emails sin envíos en 90+ días`, severity: 'warning' });
  if (openRateBajo.length > 0) insights.push({ id: 'open-low', title: `${openRateBajo.length} emails con tasa de apertura < ${OPEN_RATE_THRESHOLD}%`, severity: 'warning' });
  if (sinCta.length > 0) insights.push({ id: 'no-cta', title: `${sinCta.length} emails sin CTA visible`, severity: 'info' });
  if (sinAbTest.length > 0 && total > 0) insights.push({ id: 'no-ab', title: `${sinAbTest.length} emails sin A/B test`, severity: 'info' });
  const score = computeScore(total, [sinEnvio90.length, openRateBajo.length, sinCta.length, sinAbTest.length]);

  return {
    score: Math.min(100, Math.max(0, score)),
    total,
    sinEnvio90: sinEnvio90.length,
    openRateBajo: openRateBajo.length,
    sinCta: sinCta.length,
    sinAbTest: sinAbTest.length,
    insights: insights.slice(0, 3),
    level: score >= 86 ? 'verde' : score >= 66 ? 'amarillo' : 'rojo',
  };
}

function computeScore(total, counts) {
  if (total === 0) return 0;
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
