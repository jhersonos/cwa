import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import db from "./plugins/db.js";
import oauthRoutes from "./routes/oauth.js";
import scanRoutes from "./routes/scan.js";
import scanV2Routes from "./routes/scanV2.js";
import scanV3Routes from "./routes/scanV3.js"; 
import scanDetailsRoutes from "./routes/scanDetails.routes.js";
import scanProgressiveRoutes from "./routes/scanProgressive.js";
import debugRoutes from "./routes/debug.js";
import unlockRoutes from "./routes/unlock.js";
import contactsDetailsRoutes from "./routes/contactsDetails.js";
import paymentRoutes from "./routes/payment.js";
import listsRoutes from "./routes/lists.js";
import listsDebugRoutes from "./routes/listsDebug.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function buildApp() {
  const app = Fastify({ 
    logger: true,
    // Aceptar requests sin Content-Type header (para HubSpot fetch)
    ignoreTrailingSlash: true,
    bodyLimit: 1048576 // 1MB
  });

  // Parser customizado para requests sin Content-Type
  app.addContentTypeParser('*', { parseAs: 'string' }, (req, body, done) => {
    try {
      // Intentar parsear como JSON si parece JSON
      if (body && (body.startsWith('{') || body.startsWith('['))) {
        const json = JSON.parse(body);
        done(null, json);
      } else {
        done(null, body);
      }
    } catch (err) {
      done(err);
    }
  });

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
  await app.register(debugRoutes);
  await app.register(unlockRoutes);
  await app.register(contactsDetailsRoutes);
  await app.register(paymentRoutes);
  await app.register(listsRoutes);
  await app.register(listsDebugRoutes);
  
  app.get("/", async () => {
    return {
      status: "ok",
      app: "Cost Waste Analyzer"
    };
  });

  // Ruta específica para página de descarga
  app.get("/downloading.html", async (req, reply) => {
    try {
      const htmlPath = path.join(__dirname, '../public/downloading.html');
      const html = readFileSync(htmlPath, 'utf-8');
      reply.type('text/html').send(html);
    } catch (error) {
      app.log.error({ err: error }, "Error serving downloading.html");
      reply.code(500).send({ error: "Failed to load download page" });
    }
  });

  // Ruta específica para página de éxito de OAuth
  app.get("/oauth-success.html", async (req, reply) => {
    try {
      const htmlPath = path.join(__dirname, '../public/oauth-success.html');
      const html = readFileSync(htmlPath, 'utf-8');
      reply.type('text/html').send(html);
    } catch (error) {
      app.log.error({ err: error }, "Error serving oauth-success.html");
      reply.code(500).send({ error: "Failed to load OAuth success page" });
    }
  });

  return app;
}
