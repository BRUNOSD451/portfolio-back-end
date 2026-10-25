import "dotenv/config";

export const databaseUrl =
  process.env.DATABASE_URL ||
  `mysql://${encodeURIComponent(process.env.DB_USER || "root")}:${encodeURIComponent(process.env.DB_PASSWORD || "")}@${process.env.DB_HOST || "127.0.0.1"}:${process.env.DB_PORT || 3306}/${encodeURIComponent(process.env.DB_NAME || "")}`;
