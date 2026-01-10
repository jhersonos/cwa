const WEIGHTS = {
  contacts: 0.30,    // Reducido para dar espacio a deals y companies
  users: 0.20,       // Reducido
  deals: 0.30,       // Nuevo - crítico para operación comercial
  companies: 0.20    // Nuevo - importante para B2B
};

const VISIBILITY_PENALTY = 0.85;

/**
 * Calcula el Efficiency Score global (0–100)
 * Incluye: Contactos, Usuarios, Deals y Empresas
 */
export function calculateEfficiencyScore({ contacts, users, deals, companies }) {
  // Calcular score promedio de deals (basado en múltiples indicadores)
  let dealsScore = 100;
  if (deals && deals.total > 0) {
    const dealScores = [];
    if (deals.withoutContact?.score) dealScores.push(deals.withoutContact.score);
    if (deals.withoutOwner?.score) dealScores.push(deals.withoutOwner.score);
    if (deals.withoutPrice?.score) dealScores.push(deals.withoutPrice.score);
    if (deals.inactive?.score) dealScores.push(deals.inactive.score);
    
    dealsScore = dealScores.length > 0
      ? Math.round(dealScores.reduce((a, b) => a + b, 0) / dealScores.length)
      : 100;
  }

  // Calcular score promedio de companies
  let companiesScore = 100;
  if (companies && companies.total > 0) {
    const companyScores = [];
    if (companies.withoutDomain?.score) companyScores.push(companies.withoutDomain.score);
    if (companies.withoutOwner?.score) companyScores.push(companies.withoutOwner.score);
    if (companies.withoutPhone?.score) companyScores.push(companies.withoutPhone.score);
    if (companies.inactive?.score) companyScores.push(companies.inactive.score);
    
    companiesScore = companyScores.length > 0
      ? Math.round(companyScores.reduce((a, b) => a + b, 0) / companyScores.length)
      : 100;
  }

  // Calcular score ponderado
  let score =
    (contacts.score * WEIGHTS.contacts) +
    (users.score * WEIGHTS.users) +
    (dealsScore * WEIGHTS.deals) +
    (companiesScore * WEIGHTS.companies);

  // 🔒 Limited visibility SOLO si hubo error real
  const hasLimitedVisibility =
    contacts.visibilityError === true ||
    users.visibilityError === true ||
    (deals && deals.limitedVisibility === true) ||
    (companies && companies.limitedVisibility === true);

  if (hasLimitedVisibility) {
    score *= VISIBILITY_PENALTY;
  }

  return {
    score: Math.round(score),
    hasLimitedVisibility,
    breakdown: {
      contacts: contacts.score,
      users: users.score,
      deals: dealsScore,
      companies: companiesScore
    }
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
