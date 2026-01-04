// src/routes/scanV3.js
import { runScanV3 } from "../controllers/scan.controller.js";
import { getScanHistoryHandler } from "../controllers/history.controller.js";

export default async function scanV3Routes(fastify) {
  fastify.get("/api/scan-v3", runScanV3);

  // ✅ HISTORY (V1)
  fastify.get("/api/scan-v3/history", getScanHistoryHandler);
}