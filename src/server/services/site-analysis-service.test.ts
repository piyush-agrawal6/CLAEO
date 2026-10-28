import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, type TestDb } from "@/lib/db/test-db";
import { getDb } from "@/lib/db";
import { crawlJobs, domains, sitePages } from "@/lib/db/schema";
import type { LookupFn } from "@/server/services/crawler/ssrf-guard";
import { runDomainAnalysis } from "@/server/services/site-analysis-service";
import { createUserWithWorkspace } from "@/server/services/user-service";

const PUBLIC_IP: LookupFn = async () => ["93.184.216.34"];
const PRIVATE_IP: LookupFn = async () => ["192.168.0.10"];

function makeFetch(routes: Record<string, { body?: string; contentType?: string; status?: number }>) {
  return (async (input: RequestInfo | URL) => {
    const spec = routes[String(input)];
    if (!spec) return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    return new Response(spec.body ?? "", {
      status: spec.status ?? 200,
      headers: { "content-type": spec.contentType ?? "text/html" },
    });
  }) as unknown as typeof fetch;
}

const html = (body: string) => `<html><head></head><body>${body}</body></html>`;

describe("runDomainAnalysis (PGlite)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await setupTestDb();
  });

  afterAll(async () => {
    await testDb.close();
  });

  async function createWorkspaceWithDomain(host: string) {
    const result = await createUserWithWorkspace({
      name: "Analyst",
      email: `${host.replace(/[^a-z0-9]/g, "-")}@analysis-test.com`,
      password: "Sup3rSecret!",
    });
    const db = getDb();
    const [domain] = await db
      .insert(domains)
      .values({
        workspaceId: result.workspaceId,
        domain: `https://${host}`,
        normalizedDomain: host,
        status: "pending",
      })
      .returning();
    return { ...result, domain: domain! };
  }

  it("fails loudly and persists the failure when the start URL is unsafe", async () => {
    const { workspaceId, domain } = await createWorkspaceWithDomain("blocked.analysis.test");

    const outcome = await runDomainAnalysis({
      workspaceId,
      domain,
      deps: { lookup: PRIVATE_IP, fetch: makeFetch({}) },
    });

    expect(outcome.status).toBe("failed");
    expect(outcome.error).toMatch(/private or reserved/);
    expect(outcome.suggestion).toBeNull();

    const db = getDb();
    const [job] = await db
      .select()
      .from(crawlJobs)
      .where(eq(crawlJobs.domainId, domain.id));
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(/private or reserved/);

    const [updated] = await db.select().from(domains).where(eq(domains.id, domain.id));
    expect(updated?.status).toBe("error");
  });

  it("crawls, persists pages and returns a mocked suggestion", async () => {
    const { workspaceId, domain } = await createWorkspaceWithDomain("acme.analysis.test");
    const fetchImpl = makeFetch({
      "https://acme.analysis.test/": {
        body: html(
          "<title>Acme Metrics — Analytics software for product teams</title>" +
            '<meta name="description" content="Analytics software for product teams." />' +
            "<h1>Acme Metrics</h1><p>Analytics software with dashboards and workflow automation.</p>" +
            '<a href="/pricing">pricing</a>'
        ),
      },
      "https://acme.analysis.test/pricing": {
        body: html("<h1>Pricing</h1><p>Simple pricing for analytics software.</p>"),
      },
    });

    const outcome = await runDomainAnalysis({
      workspaceId,
      domain,
      config: { maxPages: 5, maxBytesPerPage: 100_000, maxRedirects: 3, maxDurationMs: 30_000, pageTimeoutMs: 5_000 },
      deps: { lookup: PUBLIC_IP, fetch: fetchImpl },
    });

    expect(outcome.status).toBe("completed");
    expect(outcome.pagesCrawled).toBe(2);
    expect(outcome.pagesRead).toBe(2);
    expect(outcome.suggestion).not.toBeNull();
    expect(outcome.suggestion?.name).toBe("Acme Metrics");
    expect(outcome.mocked).toBe(true);

    const db = getDb();
    const [job] = await db.select().from(crawlJobs).where(eq(crawlJobs.domainId, domain.id));
    expect(job?.status).toBe("completed");
    expect(job?.maxPages).toBe(5); // caps snapshot for honest reporting

    const pages = await db.select().from(sitePages).where(eq(sitePages.crawlJobId, job!.id));
    expect(pages).toHaveLength(2);
    const home = pages.find((page) => page.url === "https://acme.analysis.test/");
    expect(home?.title).toBe("Acme Metrics — Analytics software for product teams");
    expect(home?.textContent).toContain("Analytics software with dashboards");

    const [updated] = await db.select().from(domains).where(eq(domains.id, domain.id));
    expect(updated?.status).toBe("ready");
  });

  it("completes honestly (no suggestion) when pages have no readable text", async () => {
    const { workspaceId, domain } = await createWorkspaceWithDomain("empty.analysis.test");
    const fetchImpl = makeFetch({
      "https://empty.analysis.test/": { body: html("<canvas></canvas>") },
    });

    const outcome = await runDomainAnalysis({
      workspaceId,
      domain,
      deps: { lookup: PUBLIC_IP, fetch: fetchImpl },
    });

    expect(outcome.status).toBe("completed");
    expect(outcome.pagesRead).toBe(0);
    expect(outcome.suggestion).toBeNull();
    expect(outcome.error).toMatch(/no readable text/);

    const db = getDb();
    const [updated] = await db.select().from(domains).where(eq(domains.id, domain.id));
    expect(updated?.status).toBe("error");
  });
});
