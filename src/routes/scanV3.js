// src/routes/scanV3.js
import { runScanV3 } from "../controllers/scan.controller.js";

export default async function scanV3Routes(fastify) {
  fastify.get("/api/scan-v3", runScanV3);
}
