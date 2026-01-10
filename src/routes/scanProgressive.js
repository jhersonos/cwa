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
    const start = Date.now();
    
    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    try {
      req.server.log.info({ portalId }, "Starting contacts analysis");
      
      const authStart = Date.now();
      const token = await getValidAccessToken(req.server, portalId);
      req.server.log.info({ durationMs: Date.now() - authStart }, "Auth completed");
      
      const analysisStart = Date.now();
      const contacts = await analyzeContacts(req.server, portalId, token);
      req.server.log.info({ durationMs: Date.now() - analysisStart }, "Contacts analysis completed");
      
      const totalDuration = Date.now() - start;
      req.server.log.info({ totalDurationMs: totalDuration }, "Contacts endpoint finished");
      
      return {
        step: "contacts",
        progress: 20,
        data: contacts,
        trafficLight: getTrafficLightStatus(contacts.score),
        meta: { durationMs: totalDuration }
      };
    } catch (err) {
      req.server.log.error({ err, portalId, durationMs: Date.now() - start }, "Contacts analysis failed");
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
    const start = Date.now();
    
    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    try {
      req.server.log.info({ portalId }, "Starting users analysis");
      
      const authStart = Date.now();
      const token = await getValidAccessToken(req.server, portalId);
      req.server.log.info({ durationMs: Date.now() - authStart }, "Auth completed");
      
      const analysisStart = Date.now();
      const users = await analyzeUsers(req.server, portalId, token);
      req.server.log.info({ durationMs: Date.now() - analysisStart }, "Users analysis completed");
      
      const totalDuration = Date.now() - start;
      req.server.log.info({ totalDurationMs: totalDuration }, "Users endpoint finished");
      
      return {
        step: "users",
        progress: 40,
        data: users,
        trafficLight: getTrafficLightStatus(users.score),
        meta: { durationMs: totalDuration }
      };
    } catch (err) {
      req.server.log.error({ err, portalId, durationMs: Date.now() - start }, "Users analysis failed");
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
    const start = Date.now();
    
    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    try {
      req.server.log.info({ portalId }, "Starting deals analysis");
      
      const authStart = Date.now();
      const token = await getValidAccessToken(req.server, portalId);
      req.server.log.info({ durationMs: Date.now() - authStart }, "Auth completed");
      
      const analysisStart = Date.now();
      const deals = await analyzeDeals(req.server, portalId, token);
      req.server.log.info({ durationMs: Date.now() - analysisStart }, "Deals analysis completed");
      
      // Calcular score promedio de deals
      const dealScores = [];
      if (deals.withoutContact?.score) dealScores.push(deals.withoutContact.score);
      if (deals.withoutOwner?.score) dealScores.push(deals.withoutOwner.score);
      if (deals.withoutPrice?.score) dealScores.push(deals.withoutPrice.score);
      if (deals.inactive?.score) dealScores.push(deals.inactive.score);
      
      const dealsScore = dealScores.length > 0
        ? Math.round(dealScores.reduce((a, b) => a + b, 0) / dealScores.length)
        : 100;
      
      const totalDuration = Date.now() - start;
      req.server.log.info({ totalDurationMs: totalDuration }, "Deals endpoint finished");
      
      return {
        step: "deals",
        progress: 60,
        data: deals,
        trafficLight: getTrafficLightStatus(dealsScore),
        meta: { durationMs: totalDuration }
      };
    } catch (err) {
      req.server.log.error({ err, portalId, durationMs: Date.now() - start }, "Deals analysis failed");
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
    const start = Date.now();
    
    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    try {
      req.server.log.info({ portalId }, "Starting companies analysis");
      
      const authStart = Date.now();
      const token = await getValidAccessToken(req.server, portalId);
      req.server.log.info({ durationMs: Date.now() - authStart }, "Auth completed");
      
      const analysisStart = Date.now();
      const companies = await analyzeCompanies(req.server, portalId, token);
      req.server.log.info({ durationMs: Date.now() - analysisStart }, "Companies analysis completed");
      
      // Calcular score promedio de companies
      const companyScores = [];
      if (companies.withoutDomain?.score) companyScores.push(companies.withoutDomain.score);
      if (companies.withoutOwner?.score) companyScores.push(companies.withoutOwner.score);
      if (companies.withoutPhone?.score) companyScores.push(companies.withoutPhone.score);
      if (companies.inactive?.score) companyScores.push(companies.inactive.score);
      
      const companiesScore = companyScores.length > 0
        ? Math.round(companyScores.reduce((a, b) => a + b, 0) / companyScores.length)
        : 100;
      
      const totalDuration = Date.now() - start;
      req.server.log.info({ totalDurationMs: totalDuration }, "Companies endpoint finished");
      
      return {
        step: "companies",
        progress: 80,
        data: companies,
        trafficLight: getTrafficLightStatus(companiesScore),
        meta: { durationMs: totalDuration }
      };
    } catch (err) {
      req.server.log.error({ err, portalId, durationMs: Date.now() - start }, "Companies analysis failed");
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
    const start = Date.now();
    
    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    try {
      req.server.log.info({ portalId }, "Starting tools analysis");
      
      const authStart = Date.now();
      const token = await getValidAccessToken(req.server, portalId);
      req.server.log.info({ durationMs: Date.now() - authStart }, "Auth completed");
      
      const analysisStart = Date.now();
      const tools = await analyzeToolsUsage(req.server, portalId, token);
      req.server.log.info({ durationMs: Date.now() - analysisStart }, "Tools analysis completed");
      
      const totalDuration = Date.now() - start;
      req.server.log.info({ totalDurationMs: totalDuration }, "Tools endpoint finished");
      
      return {
        step: "tools",
        progress: 90,
        data: tools,
        meta: { durationMs: totalDuration }
      };
    } catch (err) {
      req.server.log.error({ err, portalId, durationMs: Date.now() - start }, "Tools analysis failed");
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
    const start = Date.now();
    
    // HubSpot puede enviar portalId como query param
    const portalId = req.body?.portalId || req.query?.portalId;
    const { contacts, users, deals, companies, tools } = req.body || {};
    
    req.server.log.info({ 
      portalId, 
      hasBody: !!req.body,
      hasQuery: !!req.query,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      queryKeys: req.query ? Object.keys(req.query) : []
    }, "Starting finalize");
    
    if (!portalId) {
      req.server.log.error({ 
        body: req.body, 
        query: req.query 
      }, "Missing portalId in both body and query");
      return reply.code(400).send({ 
        error: "Missing portalId",
        debug: {
          hasBody: !!req.body,
          hasQuery: !!req.query,
          bodyKeys: req.body ? Object.keys(req.body) : [],
          queryKeys: req.query ? Object.keys(req.query) : []
        }
      });
    }

    try {
      // Validar datos recibidos
      if (!contacts || !users || !deals || !companies || !tools) {
        throw new Error("Missing required data: " + JSON.stringify({
          hasContacts: !!contacts,
          hasUsers: !!users,
          hasDeals: !!deals,
          hasCompanies: !!companies,
          hasTools: !!tools
        }));
      }

      req.server.log.info("Calculating efficiency score");
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

      req.server.log.info("Calculating traffic lights");
      // Calcular traffic lights
      const trafficLights = {
        contacts: getTrafficLightStatus(contacts.score),
        users: getTrafficLightStatus(users.score),
        deals: getTrafficLightStatus(efficiencyResult.breakdown.deals),
        companies: getTrafficLightStatus(efficiencyResult.breakdown.companies)
      };

      req.server.log.info("Generating insights");
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

      req.server.log.info("Generating prioritization");
      // Generar priorización
      const prioritization = generatePrioritization(
        insights,
        efficiency.score,
        trafficLights
      );

      const totalDuration = Date.now() - start;
      req.server.log.info({ totalDurationMs: totalDuration }, "Finalize completed");

      return {
        step: "complete",
        progress: 100,
        efficiency,
        trafficLights,
        insights,
        prioritization,
        meta: { durationMs: totalDuration }
      };
    } catch (err) {
      req.server.log.error({ 
        err, 
        portalId, 
        errorMessage: err.message,
        errorStack: err.stack,
        durationMs: Date.now() - start 
      }, "Finalize failed");
      
      return reply.code(500).send({ 
        error: "Finalize failed", 
        message: err.message,
        details: err.stack
      });
    }
  });
}

