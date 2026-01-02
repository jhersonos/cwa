import fp from "fastify-plugin";
import mysql from "mysql2/promise";

export default fp(async (fastify) => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5
  });

  fastify.decorate("db", pool);

  fastify.addHook("onClose", async () => {
    await pool.end();
  });
});
