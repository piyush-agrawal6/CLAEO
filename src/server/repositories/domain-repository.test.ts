import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestDb, type TestDb } from "@/lib/db/test-db";
import {
  countDomains,
  createDomain,
  deleteDomain,
  getDomainById,
  listDomains,
  updateDomainStatus,
} from "@/server/repositories/domain-repository";
import { createUserWithWorkspace } from "@/server/services/user-service";

/**
 * IDOR protection at the query level: every domain operation is scoped to a
 * workspace id that comes from the caller's session membership — never from
 * client input. These tests prove cross-workspace reads and writes fail.
 */
describe("domain repository workspace isolation (PGlite)", () => {
  let testDb: TestDb;
  let workspaceA: string;
  let workspaceB: string;
  let domainId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const a = await createUserWithWorkspace({
      name: "Workspace A Owner",
      email: "owner@alpha.example",
      password: "Sup3rSecret!",
    });
    const b = await createUserWithWorkspace({
      name: "Workspace B Owner",
      email: "owner@beta.example",
      password: "Sup3rSecret!",
    });
    workspaceA = a.workspaceId;
    workspaceB = b.workspaceId;

    const domain = await createDomain({
      workspaceId: workspaceA,
      domain: "alpha.example",
      normalizedDomain: "alpha.example",
      name: "Alpha",
    });
    domainId = domain.id;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("lists only the caller's domains", async () => {
    const aDomains = await listDomains(workspaceA);
    const bDomains = await listDomains(workspaceB);

    expect(aDomains).toHaveLength(1);
    expect(aDomains[0]!.id).toBe(domainId);
    expect(bDomains).toHaveLength(0);
  });

  it("returns null when reading another workspace's domain by id", async () => {
    expect(await getDomainById(workspaceA, domainId)).not.toBeNull();
    expect(await getDomainById(workspaceB, domainId)).toBeNull();
  });

  it("refuses status updates from another workspace", async () => {
    const updated = await updateDomainStatus(workspaceB, domainId, "analyzing");
    expect(updated).toBeNull();

    // Status unchanged in workspace A.
    const current = await getDomainById(workspaceA, domainId);
    expect(current!.status).toBe("pending");
  });

  it("refuses deletion from another workspace", async () => {
    expect(await deleteDomain(workspaceB, domainId)).toBe(false);
    expect(await countDomains(workspaceA)).toBe(1);

    // The real owner can delete it.
    expect(await deleteDomain(workspaceA, domainId)).toBe(true);
    expect(await countDomains(workspaceA)).toBe(0);
    expect(await getDomainById(workspaceA, domainId)).toBeNull();
  });
});
