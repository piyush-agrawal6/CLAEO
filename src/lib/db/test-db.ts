import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";
import { setDbForTesting, type Database } from "@/lib/db";

/**
 * Embedded PostgreSQL (PGlite) for tests.
 *
 * Real migrations from ./drizzle run against an in-process database, so
 * tests validate the ACTUAL schema — no external services, no cost.
 */

export interface TestDb {
  db: PgliteDatabase<typeof schema>;
  close: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return {
    db,
    close: async () => {
      await client.close();
    },
  };
}

/** Create the embedded DB and register it as the app-wide database. */
export async function setupTestDb(): Promise<TestDb> {
  const testDb = await createTestDb();
  setDbForTesting(testDb.db as unknown as Database);
  return {
    db: testDb.db,
    close: async () => {
      setDbForTesting(null);
      await testDb.close();
    },
  };
}
