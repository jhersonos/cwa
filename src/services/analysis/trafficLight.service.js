// src/services/analysis/trafficLight.service.js

/**
 * Calcula el estado de semáforo basado en el score
 * @param {number} score - Score entre 0-100
 * @returns {string} - "green", "yellow", "red"
 */
export function getTrafficLightStatus(score) {
  if (score >= 80) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

/**
 * Calcula el emoji de semáforo
 * @param {string} status - "green", "yellow", "red"
 * @returns {string} - Emoji correspondiente
 */
export function getTrafficLightEmoji(status) {
  switch (status) {
    case "green":
      return "🟢";
    case "yellow":
      return "🟡";
    case "red":
      return "🔴";
    default:
      return "⚪";
  }
}

/**
 * Calcula el label descriptivo del estado
 * @param {string} status - "green", "yellow", "red"
 * @returns {string} - Descripción del estado
 */
export function getTrafficLightLabel(status) {
  switch (status) {
    case "green":
      return "Excelente";
    case "yellow":
      return "Necesita atención";
    case "red":
      return "Crítico";
    default:
      return "Desconocido";
  }
}

/**
 * Genera el objeto completo de semáforo para un score
 * @param {number} score - Score entre 0-100
 * @param {string} objectType - Tipo de objeto (contacts, deals, companies, etc.)
 * @returns {Object} - Objeto con status, emoji, label, score
 */
export function calculateTrafficLight(score, objectType) {
  const status = getTrafficLightStatus(score);
  
  return {
    objectType,
    score,
    status,
    emoji: getTrafficLightEmoji(status),
    label: getTrafficLightLabel(status)
  };
}

/**
 * Calcula el semáforo para todos los objetos del análisis
 * @param {Object} analysis - Resultados del análisis completo
 * @returns {Object} - Objeto con semáforos por tipo
 */
export function calculateAllTrafficLights(analysis) {
  const trafficLights = {};

  // Contacts
  if (analysis.contacts && typeof analysis.contacts.score === 'number') {
    trafficLights.contacts = calculateTrafficLight(
      analysis.contacts.score,
      'contacts'
    );
  }

  // Deals
  if (analysis.deals) {
    // Calcular un score promedio basado en los diferentes aspectos
    const dealScores = [];
    
    if (analysis.deals.withoutContact?.score) dealScores.push(analysis.deals.withoutContact.score);
    if (analysis.deals.withoutOwner?.score) dealScores.push(analysis.deals.withoutOwner.score);
    if (analysis.deals.withoutPrice?.score) dealScores.push(analysis.deals.withoutPrice.score);
    if (analysis.deals.inactive?.score) dealScores.push(analysis.deals.inactive.score);

    const avgDealScore = dealScores.length > 0
      ? Math.round(dealScores.reduce((a, b) => a + b, 0) / dealScores.length)
      : 100;

    trafficLights.deals = calculateTrafficLight(avgDealScore, 'deals');
  }

  // Companies
  if (analysis.companies) {
    const companyScores = [];
    
    if (analysis.companies.withoutDomain?.score) companyScores.push(analysis.companies.withoutDomain.score);
    if (analysis.companies.withoutOwner?.score) companyScores.push(analysis.companies.withoutOwner.score);
    if (analysis.companies.withoutPhone?.score) companyScores.push(analysis.companies.withoutPhone.score);
    if (analysis.companies.inactive?.score) companyScores.push(analysis.companies.inactive.score);

    const avgCompanyScore = companyScores.length > 0
      ? Math.round(companyScores.reduce((a, b) => a + b, 0) / companyScores.length)
      : 100;

    trafficLights.companies = calculateTrafficLight(avgCompanyScore, 'companies');
  }

  // Users
  if (analysis.users && typeof analysis.users.score === 'number') {
    trafficLights.users = calculateTrafficLight(
      analysis.users.score,
      'users'
    );
  }

  // Overall summary
  const allScores = Object.values(trafficLights).map(t => t.score);
  const overallScore = allScores.length > 0
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : 100;

  trafficLights.overall = calculateTrafficLight(overallScore, 'overall');

  return trafficLights;
}

