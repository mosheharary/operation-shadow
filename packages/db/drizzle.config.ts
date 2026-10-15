import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` only diffs the schema; it never connects. Migrations are applied by
// src/migrate-cli.ts using the direct (unpooled) connection.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  strict: true,
  verbose: true,
});
