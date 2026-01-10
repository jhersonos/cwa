// src/routes/scanProgressive.js
/**
 * PROGRESSIVE SCAN ENDPOINTS
 * Cada endpoint analiza un tipo de objeto
 * El frontend los llama secuencialmente para evitar timeouts
 */

import { getValidAccessToken } from "../services/hubspot/token.service.js";
import { analyzeContacts } from "../services/analysis/contacts.analysis.js";
import { analyzeUsers } from "../services/analysis/users.analysis.js";
import { analyzeDeals } from "../services/analysis/deals.analysis.js";
import { analyzeCompanies } from "../services/analysis/companies.analysis.js";
import { analyzeToolsUsage } from "../services/analysis/tools.analysis.js";
import { calculateEfficiencyScore, getEfficiencyLevel } from "../services/analysis/efficiencyScore.service.js";
import { generateInsights } from "../services/analysis/insights.service.js";
import { generatePrioritization } from "../services/analysis/prioritization.service.js";
import { getTrafficLightStatus } from "../services/analysis/trafficLight.service.js";

export default async function scanProgressiveRoutes(fastify) {
  
  /* ----------------------------------
     ENDPOINT 1: CONTACTOS
  ---------------------------------- */
  fastify.get("/api/scan-progressive/contacts", async (req, reply) => {
    const { portalId } = req.query;
    
    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    try {
      const token = await getValidAccessToken(req.server, portalId);
      const contacts = await analyzeContacts(req.server, portalId, token);
      
      return {
        step: "contacts",
        progress: 20,
        data: contacts,
        trafficLight: getTrafficLightStatus(contacts.score)
      };
    } catch (err) {
      req.server.log.error({ err, portalId }, "Contacts analysis failed");
      return reply.code(500).send({ 
        error: "Contacts analysis failed", 
        message: err.message 
      });
    }
  });

  /* ----------------------------------
     ENDPOINT 2: USUARIOS
  ---------------------------------- */
  fastify.get("/api/scan-progressive/users", async (req, reply) => {
    const { portalId } = req.query;
    
    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    try {
      const token = await getValidAccessToken(req.server, portalId);
      const users = await analyzeUsers(req.server, portalId, token);
      
      return {
        step: "users",
        progress: 40,
        data: users,
        trafficLight: getTrafficLightStatus(users.score)
      };
    } catch (err) {
      req.server.log.error({ err, portalId }, "Users analysis failed");
      return reply.code(500).send({ 
        error: "Users analysis failed", 
        message: err.message 
      });
    }
  });

  /* ----------------------------------
     ENDPOINT 3: DEALS
  ---------------------------------- */
  fastify.get("/api/scan-progressive/deals", async (req, reply) => {
    const { portalId } = req.query;
    
    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    try {
      const token = await getValidAccessToken(req.server, portalId);
      const deals = await analyzeDeals(req.server, portalId, token);
      
      // Calcular score promedio de deals
      const dealScores = [];
      if (deals.withoutContact?.score) dealScores.push(deals.withoutContact.score);
      if (deals.withoutOwner?.score) dealScores.push(deals.withoutOwner.score);
      if (deals.withoutPrice?.score) dealScores.push(deals.withoutPrice.score);
      if (deals.inactive?.score) dealScores.push(deals.inactive.score);
      
      const dealsScore = dealScores.length > 0
        ? Math.round(dealScores.reduce((a, b) => a + b, 0) / dealScores.length)
        : 100;
      
      return {
        step: "deals",
        progress: 60,
        data: deals,
        trafficLight: getTrafficLightStatus(dealsScore)
      };
    } catch (err) {
      req.server.log.error({ err, portalId }, "Deals analysis failed");
      return reply.code(500).send({ 
        error: "Deals analysis failed", 
        message: err.message 
      });
    }
  });

  /* ----------------------------------
     ENDPOINT 4: EMPRESAS
  ---------------------------------- */
  fastify.get("/api/scan-progressive/companies", async (req, reply) => {
    const { portalId } = req.query;
    
    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    try {
      const token = await getValidAccessToken(req.server, portalId);
      const companies = await analyzeCompanies(req.server, portalId, token);
      
      // Calcular score promedio de companies
      const companyScores = [];
      if (companies.withoutDomain?.score) companyScores.push(companies.withoutDomain.score);
      if (companies.withoutOwner?.score) companyScores.push(companies.withoutOwner.score);
      if (companies.withoutPhone?.score) companyScores.push(companies.withoutPhone.score);
      if (companies.inactive?.score) companyScores.push(companies.inactive.score);
      
      const companiesScore = companyScores.length > 0
        ? Math.round(companyScores.reduce((a, b) => a + b, 0) / companyScores.length)
        : 100;
      
      return {
        step: "companies",
        progress: 80,
        data: companies,
        trafficLight: getTrafficLightStatus(companiesScore)
      };
    } catch (err) {
      req.server.log.error({ err, portalId }, "Companies analysis failed");
      return reply.code(500).send({ 
        error: "Companies analysis failed", 
        message: err.message 
      });
    }
  });

  /* ----------------------------------
     ENDPOINT 5: HERRAMIENTAS
  ---------------------------------- */
  fastify.get("/api/scan-progressive/tools", async (req, reply) => {
    const { portalId } = req.query;
    
    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    try {
      const token = await getValidAccessToken(req.server, portalId);
      const tools = await analyzeToolsUsage(req.server, portalId, token);
      
      return {
        step: "tools",
        progress: 90,
        data: tools
      };
    } catch (err) {
      req.server.log.error({ err, portalId }, "Tools analysis failed");
      return reply.code(500).send({ 
        error: "Tools analysis failed", 
        message: err.message 
      });
    }
  });

  /* ----------------------------------
     ENDPOINT 6: FINALIZAR (Insights + Prioritization)
  ---------------------------------- */
  fastify.post("/api/scan-progressive/finalize", async (req, reply) => {
    const { portalId, contacts, users, deals, companies, tools } = req.body;
    
    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    try {
      // Calcular efficiency score
      const efficiencyResult = calculateEfficiencyScore({
        contacts,
        users,
        deals,
        companies
      });

      const efficiency = {
        score: efficiencyResult.score,
        level: getEfficiencyLevel(efficiencyResult.score),
        hasLimitedVisibility: efficiencyResult.hasLimitedVisibility,
        breakdown: efficiencyResult.breakdown
      };

      // Calcular traffic lights
      const trafficLights = {
        contacts: getTrafficLightStatus(contacts.score),
        users: getTrafficLightStatus(users.score),
        deals: getTrafficLightStatus(efficiencyResult.breakdown.deals),
        companies: getTrafficLightStatus(efficiencyResult.breakdown.companies)
      };

      // Generar insights
      const insights = generateInsights({
        efficiency,
        contacts,
        users,
        deals,
        companies,
        tools,
        trafficLights
      });

      // Generar priorización
      const prioritization = generatePrioritization(
        insights,
        efficiency.score,
        trafficLights
      );

      return {
        step: "complete",
        progress: 100,
        efficiency,
        trafficLights,
        insights,
        prioritization
      };
    } catch (err) {
      req.server.log.error({ err, portalId }, "Finalize failed");
      return reply.code(500).send({ 
        error: "Finalize failed", 
        message: err.message 
      });
    }
  });
}

