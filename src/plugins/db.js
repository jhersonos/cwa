import fp from "fastify-plugin";
import mysql from "mysql2/promise";

export default fp(async (fastify) => {
  // Soportar variables de Railway (MYSQLHOST) y custom (DB_HOST)
  const config = {
    host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.MYSQLPORT || process.env.DB_PORT || '3306'),
    user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD,
    database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'railway',
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 10000
  };

  fastify.log.info({
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database
  }, "MySQL connection config");

  const pool = mysql.createPool(config);

  // Decorar como 'db' y 'mysql' para compatibilidad
  fastify.decorate("db", pool);
  fastify.decorate("mysql", pool);

  // Verificar conexión al iniciar
  try {
    const connection = await pool.getConnection();
    fastify.log.info("✅ MySQL connected successfully");
    connection.release();
  } catch (err) {
    fastify.log.error({ err }, "❌ MySQL connection failed");
    throw err;
  }

  fastify.addHook("onClose", async () => {
    await pool.end();
  });
});
