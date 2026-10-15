import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";
import { ConfigurationError } from "@/lib/errors";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";

/**
 * Database connection (Neon PostgreSQL via node-postgres).
 *
 * - The pool is created lazily on first query so `next build` and unit tests
 *   never require a live database.
 * - Transactions are available (used for user + workspace creation).
 * - `setDbForTesting` allows tests to substitute an embedded PGlite database.
 */

export type Database = NodePgDatabase<typeof schema>;
export { schema };

let pool: Pool | null = null;
let database: Database | null = null;
let testDatabase: Database | null = null;

export function getDb(): Database {
  if (testDatabase) return testDatabase;

  if (!database) {
    if (!env.DATABASE_URL) {
      throw new ConfigurationError(
        "Database is not configured. Set DATABASE_URL in the environment."
      );
    }
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    // A crashed backend must not take down the whole process.
    pool.on("error", (error) => {
      logger.error("Unexpected database pool error", { error });
    });
    database = drizzle(pool, { schema });
    logger.info("Database connection initialized");
  }

  return database;
}

/** Test-only: swap in an embedded database (PGlite). */
export function setDbForTesting(db: Database | null): void {
  testDatabase = db;
}

/** Close the underlying pool (used by tests and graceful shutdown). */
export async function closeDb(): Promise<void> {
  if (pool) {
    const current = pool;
    pool = null;
    database = null;
    await current.end();
  }
}

/** Lightweight connectivity probe for the health endpoint. */
export async function pingDb(): Promise<boolean> {
  if (!env.DATABASE_URL) return false;
  getDb(); // ensures the pool above is initialized
  if (!pool) return false;
  const client = await pool.connect();
  try {
    await client.query("select 1");
    return true;
  } finally {
    client.release();
  }
}
