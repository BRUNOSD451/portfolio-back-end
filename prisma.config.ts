import { defineConfig } from 'prisma/config';
import { databaseUrl } from './src/config/database-url.js';

process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: databaseUrl },
});
