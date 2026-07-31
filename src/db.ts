import mysql from "mysql2/promise";
import "dotenv/config";

export async function connectDb() {
  return mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || "redroom",
    password: process.env.DB_PASSWORD || "redroom",
    database: process.env.DB_NAME || "redroom",
  });
}
