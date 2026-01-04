// src/services/analysis/users.analysis.js

import axios from "axios";

const HUBSPOT_API = "https://api.hubapi.com";

/**
 * USERS ANALYSIS (V3 SAFE)
 * - Nunca rompe el scan
 * - Maneja permisos
 * - Rápido
 */
export async function analyzeUsers(fastify, portalId, token) {
  try {
    const res = await axios.get(
      `${HUBSPOT_API}/settings/v3/users`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout: 8000
      }
    );

    const users = res.data?.results || [];
    const total = users.length;

    if (total === 0) {
      return {
        total: 0,
        inactive: 0,
        score: 50,
        limitedVisibility: false
      };
    }

    let inactive = 0;

    for (const u of users) {
      if (u.archived || u.status === "inactive") {
        inactive++;
      }
    }

    // 🎯 SCORE
    let score = 100;
    if (inactive / total > 0.2) score -= 20;
    if (inactive / total > 0.4) score -= 30;

    score = Math.max(40, Math.round(score));

    return {
      total,
      inactive,
      score,
      limitedVisibility: false
    };
  } catch (err) {
    const status = err?.response?.status;

    // 🚫 PERMISOS / PLAN
    if (status === 401 || status === 403) {
      fastify.log.warn(
        { portalId, status },
        "Users analysis limited by permissions"
      );

      return {
        total: 0,
        inactive: 0,
        score: 50,
        limitedVisibility: true
      };
    }

    // 🔥 Error inesperado
    fastify.log.error(
      { err, portalId },
      "Unexpected error analyzing users"
    );

    return {
      total: 0,
      inactive: 0,
      score: 50,
      limitedVisibility: true
    };
  }
}
