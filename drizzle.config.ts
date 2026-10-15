import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read `.env.local` automatically.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  dbCredentials: {
    // Only required for `db:migrate` / `db:push` / `db:studio`.
    // `db:generate` produces SQL from the schema without a live connection.
    url: process.env.DATABASE_URL ?? "postgres://user:pass@localhost:5432/db",
  },
});
