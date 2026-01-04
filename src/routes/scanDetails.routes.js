import { getScanDetails } from "../controllers/scanDetails.controller.js";

export default async function scanDetailsRoutes(server) {
  server.get("/api/scan-v3/details/:type", getScanDetails);
  server.get("/api/scan-v3/details/:type/export/xlsx", getScanDetails);
}
