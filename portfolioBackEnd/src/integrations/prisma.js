import { PrismaClient } from "@prisma/client";
import { databaseUrl } from "../config/database-url.js";

export const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});
