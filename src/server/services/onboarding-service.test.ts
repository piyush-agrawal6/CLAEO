import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, type TestDb } from "@/lib/db/test-db";
import { getDb } from "@/lib/db";
import { domains, onboardingStates, users } from "@/lib/db/schema";
import {
  completeOnboarding,
  getOnboardingView,
  isOnboardingComplete,
  setOnboardingStep,
} from "@/server/services/onboarding-service";
import { createUserWithWorkspace } from "@/server/services/user-service";

async function addDomain(workspaceId: string, host: string) {
  const db = getDb();
  await db.insert(domains).values({
    workspaceId,
    domain: `https://${host}`,
    normalizedDomain: host,
    status: "ready",
  });
}

describe("isOnboardingComplete (PGlite)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await setupTestDb();
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("is false for a user without a workspace", async () => {
    const db = getDb();
    await db.insert(users).values({ name: "No WS", email: "nows@onboarding-test.com" });
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, "nows@onboarding-test.com"));
    expect(await isOnboardingComplete(user!.id)).toBe(false);
  });

  it("is false for a fresh workspace with zero domains", async () => {
    const result = await createUserWithWorkspace({
      name: "Fresh",
      email: "fresh@onboarding-fresh.com",
      password: "Sup3rSecret!",
    });
    expect(await isOnboardingComplete(result.userId)).toBe(false);
  });

  it("becomes true once a domain exists in the workspace (legacy path)", async () => {
    const result = await createUserWithWorkspace({
      name: "Has Domain",
      email: "domain@onboarding-domain.com",
      password: "Sup3rSecret!",
    });

    const db = getDb();
    await db.insert(domains).values({
      workspaceId: result.workspaceId,
      domain: "https://www.onboarding-domain.com",
      normalizedDomain: "onboarding-domain.com",
      status: "ready",
    });

    expect(await isOnboardingComplete(result.userId)).toBe(true);
  });
});

describe("onboarding state machine (PGlite)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await setupTestDb();
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("stays incomplete mid-flow even when a domain exists", async () => {
    const result = await createUserWithWorkspace({
      name: "Mid Flow",
      email: "midflow@onboarding-state.com",
      password: "Sup3rSecret!",
    });
    await addDomain(result.workspaceId, "midflow.example.com");
    const db = getDb();
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.workspaceId, result.workspaceId));

    await setOnboardingStep(result.workspaceId, "business", {
      completed: ["website", "analyzing"],
      domainId: domain!.id,
    });

    expect(await isOnboardingComplete(result.userId)).toBe(false);
    const view = await getOnboardingView(result.userId);
    expect(view?.step).toBe("business");
    expect(view?.completedSteps).toEqual(["website", "analyzing"]);
    expect(view?.domainId).toBe(domain!.id);
  });

  it("completes only when completeOnboarding runs (sticky afterwards)", async () => {
    const result = await createUserWithWorkspace({
      name: "Finisher",
      email: "finisher@onboarding-state.com",
      password: "Sup3rSecret!",
    });
    await addDomain(result.workspaceId, "finisher.example.com");
    const db = getDb();
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.workspaceId, result.workspaceId));

    await setOnboardingStep(result.workspaceId, "queries", {
      completed: ["website", "analyzing", "business", "competitors"],
      domainId: domain!.id,
    });
    expect(await isOnboardingComplete(result.userId)).toBe(false);

    await completeOnboarding(result.workspaceId, { domainId: domain!.id });
    expect(await isOnboardingComplete(result.userId)).toBe(true);

    // Deleting the domain later does NOT drag a finished workspace back
    // (FK ON DELETE SET NULL clears the reference; "completed" is sticky).
    await db.delete(domains).where(eq(domains.id, domain!.id));
    expect(await isOnboardingComplete(result.userId)).toBe(true);
    expect((await getOnboardingView(result.userId))?.step).toBe("completed");
  });

  it("heals a mid-flow state back to website when its domain is deleted", async () => {
    const result = await createUserWithWorkspace({
      name: "Healer",
      email: "healer@onboarding-state.com",
      password: "Sup3rSecret!",
    });
    await addDomain(result.workspaceId, "healer.example.com");
    const db = getDb();
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.workspaceId, result.workspaceId));

    await setOnboardingStep(result.workspaceId, "competitors", {
      completed: ["website", "analyzing", "business"],
      domainId: domain!.id,
    });
    expect((await getOnboardingView(result.userId))?.step).toBe("competitors");

    // FK ON DELETE SET NULL empties domainId; the view heals to "website".
    await db.delete(domains).where(eq(domains.id, domain!.id));
    const healed = await getOnboardingView(result.userId);
    expect(healed?.step).toBe("website");
    expect(healed?.domainId).toBeNull();
    expect(await isOnboardingComplete(result.userId)).toBe(false);
  });

  it("keeps workspaces isolated", async () => {
    const a = await createUserWithWorkspace({
      name: "Iso A",
      email: "iso-a@onboarding-state.com",
      password: "Sup3rSecret!",
    });
    const b = await createUserWithWorkspace({
      name: "Iso B",
      email: "iso-b@onboarding-state.com",
      password: "Sup3rSecret!",
    });

    await completeOnboarding(a.workspaceId, { domainId: null });

    expect(await isOnboardingComplete(a.userId)).toBe(true);
    expect(await isOnboardingComplete(b.userId)).toBe(false);

    // Workspace B has no state row of its own — A's completion did not leak.
    const db = getDb();
    const bRows = await db
      .select()
      .from(onboardingStates)
      .where(eq(onboardingStates.workspaceId, b.workspaceId));
    expect(bRows).toHaveLength(0);
  });
});
