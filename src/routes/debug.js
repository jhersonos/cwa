// src/routes/debug.js
/**
 * DEBUG ENDPOINTS
 * Para verificar conectividad y tiempos de respuesta
 */

import { getValidAccessToken } from "../services/hubspot/token.service.js";
import axios from "axios";

export default async function debugRoutes(fastify) {
  
  /* ----------------------------------
     PING - Verificar que el backend responde
  ---------------------------------- */
  fastify.get("/api/debug/ping", async (req, reply) => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      message: "Backend is alive"
    };
  });

  /* ----------------------------------
     TEST AUTH - Verificar autenticación HubSpot
  ---------------------------------- */
  fastify.get("/api/debug/test-auth", async (req, reply) => {
    const { portalId } = req.query;
    
    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    const start = Date.now();
    
    try {
      const token = await getValidAccessToken(req.server, portalId);
      const duration = Date.now() - start;
      
      return {
        status: "ok",
        portalId,
        hasToken: !!token,
        tokenLength: token?.length || 0,
        durationMs: duration
      };
    } catch (err) {
      return reply.code(500).send({
        status: "error",
        error: err.message,
        durationMs: Date.now() - start
      });
    }
  });

  /* ----------------------------------
     TEST CONTACTS - Verificar llamada simple a contactos
  ---------------------------------- */
  fastify.get("/api/debug/test-contacts", async (req, reply) => {
    const { portalId } = req.query;
    
    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    const start = Date.now();
    const steps = [];
    
    try {
      // Paso 1: Auth
      const authStart = Date.now();
      const token = await getValidAccessToken(req.server, portalId);
      steps.push({ step: "auth", durationMs: Date.now() - authStart });

      // Paso 2: Fetch contacts
      const fetchStart = Date.now();
      const res = await axios.get(
        "https://api.hubapi.com/crm/v3/objects/contacts",
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit: 10 },
          timeout: 5000
        }
      );
      steps.push({ step: "fetch", durationMs: Date.now() - fetchStart });

      const totalDuration = Date.now() - start;

      return {
        status: "ok",
        portalId,
        contactsCount: res.data?.results?.length || 0,
        totalContactsInAccount: res.data?.total || 0,
        totalDurationMs: totalDuration,
        steps
      };
    } catch (err) {
      return reply.code(500).send({
        status: "error",
        error: err.message,
        totalDurationMs: Date.now() - start,
        steps
      });
    }
  });

  /* ----------------------------------
     TEST FULL SCAN - Simular scan completo con tiempos
  ---------------------------------- */
  fastify.get("/api/debug/test-full-scan", async (req, reply) => {
    const { portalId } = req.query;
    
    if (!portalId) {
      return reply.code(400).send({ error: "Missing portalId" });
    }

    const start = Date.now();
    const steps = [];
    
    try {
      // Auth
      const authStart = Date.now();
      const token = await getValidAccessToken(req.server, portalId);
      steps.push({ step: "auth", durationMs: Date.now() - authStart, status: "ok" });

      // Contacts (simple)
      try {
        const contactsStart = Date.now();
        await axios.get(
          "https://api.hubapi.com/crm/v3/objects/contacts",
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { limit: 10 },
            timeout: 5000
          }
        );
        steps.push({ step: "contacts", durationMs: Date.now() - contactsStart, status: "ok" });
      } catch (err) {
        steps.push({ step: "contacts", status: "error", error: err.message });
      }

      // Users (simple)
      try {
        const usersStart = Date.now();
        await axios.get(
          "https://api.hubapi.com/settings/v3/users",
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { limit: 10 },
            timeout: 5000
          }
        );
        steps.push({ step: "users", durationMs: Date.now() - usersStart, status: "ok" });
      } catch (err) {
        steps.push({ step: "users", status: "error", error: err.message });
      }

      // Deals (simple)
      try {
        const dealsStart = Date.now();
        await axios.get(
          "https://api.hubapi.com/crm/v3/objects/deals",
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { limit: 10 },
            timeout: 5000
          }
        );
        steps.push({ step: "deals", durationMs: Date.now() - dealsStart, status: "ok" });
      } catch (err) {
        steps.push({ step: "deals", status: "error", error: err.message });
      }

      // Companies (simple)
      try {
        const companiesStart = Date.now();
        await axios.get(
          "https://api.hubapi.com/crm/v3/objects/companies",
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { limit: 10 },
            timeout: 5000
          }
        );
        steps.push({ step: "companies", durationMs: Date.now() - companiesStart, status: "ok" });
      } catch (err) {
        steps.push({ step: "companies", status: "error", error: err.message });
      }

      const totalDuration = Date.now() - start;

      return {
        status: "ok",
        portalId,
        totalDurationMs: totalDuration,
        steps,
        summary: {
          total: steps.length,
          ok: steps.filter(s => s.status === "ok").length,
          errors: steps.filter(s => s.status === "error").length
        }
      };
    } catch (err) {
      return reply.code(500).send({
        status: "error",
        error: err.message,
        totalDurationMs: Date.now() - start,
        steps
      });
    }
  });
}

