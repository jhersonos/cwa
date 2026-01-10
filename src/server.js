import "dotenv/config";
import buildApp from "./app.js";

const PORT = process.env.PORT || 3000;

// 🛡️ Manejo de errores durante la construcción del app
let app;
try {
  app = await buildApp();
  console.log("✅ App built successfully");
} catch (err) {
  console.error("❌ Failed to build app:", err);
  process.exit(1);
}

// 🛡️ Manejo de errores durante el inicio del servidor
try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`🚀 CWA backend running on port ${PORT}`);
} catch (err) {
  console.error("❌ Failed to start server:", err);
  app.log.error(err);
  process.exit(1);
}

// 🛡️ Manejo de señales de terminación
process.on("SIGTERM", async () => {
  console.log("⚠️ SIGTERM received, closing server gracefully...");
  await app.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("⚠️ SIGINT received, closing server gracefully...");
  await app.close();
  process.exit(0);
});
