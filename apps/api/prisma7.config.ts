import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  // Multi-file schema: every *.prisma file in this folder is part of the schema.
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --experimental-strip-types prisma/seed/index.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
