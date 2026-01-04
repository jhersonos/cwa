const WEIGHTS = {
  contacts: 0.6,
  users: 0.4
};

const VISIBILITY_PENALTY = 0.85;

/**
 * Calcula el Efficiency Score global (0–100)
 */
export function calculateEfficiencyScore({ contacts, users }) {
  let score =
    contacts.score * WEIGHTS.contacts +
    users.score * WEIGHTS.users;

  // 🔒 Limited visibility SOLO si hubo error real
  const hasLimitedVisibility =
    contacts.visibilityError === true ||
    users.visibilityError === true;

  if (hasLimitedVisibility) {
    score *= VISIBILITY_PENALTY;
  }

  return {
    score: Math.round(score),
    hasLimitedVisibility
  };
}

/**
 * Traduce score numérico a nivel UX
 */
export function getEfficiencyLevel(score) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Needs Attention";
  return "Critical";
}
