import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import db from "./plugins/db.js";
import oauthRoutes from "./routes/oauth.js";
import scanRoutes from "./routes/scan.js";
import scanV2Routes from "./routes/scanV2.js";
import scanV3Routes from "./routes/scanV3.js"; 
import scanDetailsRoutes from "./routes/scanDetails.routes.js";
import scanProgressiveRoutes from "./routes/scanProgressive.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function buildApp() {
  const app = Fastify({ logger: true });

  // Servir archivos estáticos desde /public
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/public/'
  });

  await app.register(db);
  await app.register(oauthRoutes);
  await app.register(scanRoutes);
  await app.register(scanV2Routes);
  await app.register(scanV3Routes); 
  await app.register(scanDetailsRoutes);
  await app.register(scanProgressiveRoutes);
  
  app.get("/", async () => {
    return {
      status: "ok",
      app: "Cost Waste Analyzer"
    };
  });

  return app;
}
