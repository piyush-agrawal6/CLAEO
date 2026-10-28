import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  businessProfiles,
  competitors,
  prompts,
  type BusinessProfile,
  type Competitor,
  type Prompt,
} from "@/lib/db/schema";
import type { BusinessProfileSource } from "@/lib/db/schema";

/**
 * Discovery persistence: business profile, competitors, tracked prompts.
 *
 * All writes are workspace/domain scoped by construction; competitor and
 * prompt inserts de-duplicate on their existing unique keys and never
 * overwrite user-edited rows (conflict = skip).
 */

export async function getBusinessProfile(workspaceId: string): Promise<BusinessProfile | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.workspaceId, workspaceId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertBusinessProfile(values: {
  workspaceId: string;
  domainId: string | null;
  name: string;
  tagline: string | null;
  description: string | null;
  industry: string | null;
  audience: string | null;
  products: string[];
  keywords: string[];
  source: BusinessProfileSource;
}): Promise<BusinessProfile> {
  const db = getDb();
  const rows = await db
    .insert(businessProfiles)
    .values({ ...values, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: businessProfiles.workspaceId,
      set: {
        domainId: values.domainId,
        name: values.name,
        tagline: values.tagline,
        description: values.description,
        industry: values.industry,
        audience: values.audience,
        products: values.products,
        keywords: values.keywords,
        source: values.source,
        updatedAt: new Date(),
      },
    })
    .returning();
  return rows[0]!;
}

export async function listCompetitors(domainId: string): Promise<Competitor[]> {
  const db = getDb();
  return db.select().from(competitors).where(eq(competitors.domainId, domainId));
}

/** Inserts competitors, skipping domains that already exist for the domain. */
export async function insertCompetitors(
  domainId: string,
  items: Array<{ name: string; domain: string; normalizedDomain: string }>
): Promise<number> {
  if (items.length === 0) return 0;
  const db = getDb();
  const rows = await db
    .insert(competitors)
    .values(items.map((item) => ({ ...item, domainId })))
    .onConflictDoNothing({ target: [competitors.domainId, competitors.normalizedDomain] })
    .returning();
  return rows.length;
}

export async function listPrompts(domainId: string): Promise<Prompt[]> {
  const db = getDb();
  return db.select().from(prompts).where(eq(prompts.domainId, domainId));
}

export async function insertPrompts(
  domainId: string,
  items: Array<{
    text: string;
    normalizedText: string;
    intent?: Prompt["intent"];
    funnelStage?: Prompt["funnelStage"];
    importance: number | null;
    source: Prompt["source"];
  }>
): Promise<number> {
  if (items.length === 0) return 0;
  const db = getDb();
  const rows = await db
    .insert(prompts)
    .values(
      items.map((item) => ({
        ...item,
        domainId,
        businessValue: null, // never fabricate an estimated value
      }))
    )
    .onConflictDoNothing({ target: [prompts.domainId, prompts.normalizedText] })
    .returning();
  return rows.length;
}
