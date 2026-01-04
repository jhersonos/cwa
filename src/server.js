import "dotenv/config";
import buildApp from "./app.js";
import path from "path";
import { fileURLToPath } from "url";
import fastifyStatic from "@fastify/static";

const app = await buildApp();

const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ USA app, NO server
app.register(fastifyStatic, {
  root: path.join(__dirname, "public"),
  prefix: "/", // ← MUY IMPORTANTE
});

app.listen({ port: PORT, host: "0.0.0.0" }, () => {
  console.log(`🚀 CWA backend running on port ${PORT}`);
});
