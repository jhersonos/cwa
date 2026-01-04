import Fastify from "fastify";
import db from "./plugins/db.js";
import oauthRoutes from "./routes/oauth.js";
import scanRoutes from "./routes/scan.js";
import scanV2Routes from "./routes/scanV2.js";
import scanV3Routes from "./routes/scanV3.js"; 
import scanDetailsRoutes from "./routes/scanDetails.routes.js";

export default async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(db);
  await app.register(oauthRoutes);
  await app.register(scanRoutes);
  await app.register(scanV2Routes);
  await app.register(scanV3Routes); 
  await app.register(scanDetailsRoutes);
  
  app.get("/", async () => {
    return {
      status: "ok",
      app: "Cost Waste Analyzer"
    };
  });

  return app;
}
