import { fetchAllUsers } from "../hubspot/users.service.js";

/**
 * Analiza eficiencia de usuarios
 */
export async function analyzeUsers(fastify, portalId, token) {
  const users = await fetchAllUsers(fastify, portalId, token);

  if (!users.length) {
    return {
      total: 0,
      inactive: 0,
      score: 50,
      limitedVisibility: true
    };
  }

  let inactiveUsers = 0;

  for (const user of users) {
    if (
      user.isSuspended ||
      !user.email ||
      user.isDeleted
    ) {
      inactiveUsers++;
    }
  }

  // 🧮 Scoring
  let score = 100;
  const inactiveRatio = inactiveUsers / users.length;

  if (inactiveRatio > 0.4) score -= 40;
  else if (inactiveRatio > 0.25) score -= 25;
  else if (inactiveRatio > 0.15) score -= 15;
  else if (inactiveRatio > 0.05) score -= 5;

  score = Math.max(40, Math.min(100, Math.round(score)));

  return {
    total: users.length,
    inactive: inactiveUsers,
    score,
    limitedVisibility: false
  };
}
