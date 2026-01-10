import axios from "axios";

const HUBSPOT_API = "https://api.hubapi.com";

/**
 * USERS ANALYSIS (V3)
 * ✅ V1 SAFE
 * - No penaliza cuentas sin usuarios
 * - Distingue error real vs no data
 * - Nunca rompe el scan
 */
export async function analyzeUsers(fastify, portalId, token) {
  let visibilityError = false;

  try {
    const res = await axios.get(
      `${HUBSPOT_API}/settings/v3/users`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout: 2500 // 🚀 Velocidad máxima
      }
    );

    const users = res.data?.results || [];
    const total = users.length;

    /* --------------------------------------------------
       🟢 CUENTA SIN USUARIOS ≠ ERROR
    -------------------------------------------------- */
    if (total === 0) {
      return {
        total: 0,
        inactive: 0,
        score: 50,                 // baseline conservador
        limitedVisibility: false,
        visibilityError: false
      };
    }

    let inactive = 0;

    for (const u of users) {
      if (u.archived || u.status === "inactive") {
        inactive++;
      }
    }

    /* --------------------------------------------------
       🎯 SCORE
    -------------------------------------------------- */
    let score = 100;

    if (inactive / total > 0.2) score -= 20;
    if (inactive / total > 0.4) score -= 30;

    score = Math.max(40, Math.round(score));

    return {
      total,
      inactive,
      score,
      limitedVisibility: false,
      visibilityError: false
    };
  } catch (err) {
    const status = err?.response?.status;

    // 🚫 Permisos / plan → visibilidad limitada REAL
    if (status === 401 || status === 403) {
      fastify.log.warn(
        { portalId, status },
        "Users analysis limited by permissions"
      );

      return {
        total: 0,
        inactive: 0,
        score: 50,
        limitedVisibility: true,
        visibilityError: true
      };
    }

    // 🔥 Error inesperado → log, pero no romper
    fastify.log.error(
      { err, portalId },
      "Unexpected error analyzing users"
    );

    return {
      total: 0,
      inactive: 0,
      score: 50,
      limitedVisibility: true,
      visibilityError: true
    };
  }
}
