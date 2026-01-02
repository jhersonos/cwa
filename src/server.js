import "dotenv/config";
import buildApp from "./app.js";

const app = await buildApp();

const PORT = process.env.PORT || 3000;

app.listen({ port: PORT, host: "0.0.0.0" }, () => {
  console.log(`🚀 CWA backend running on port ${PORT}`);
});
