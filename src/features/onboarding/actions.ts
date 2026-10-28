"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserContext } from "@/lib/auth/session";
import { reportError } from "@/lib/errors";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/security/rate-limit";
import { normalizeDomain, domainToDisplayName, safeCallbackUrl } from "@/lib/utils";
import { isNextNavigationError } from "@/features/auth/redirects";
import { createDomainAction } from "@/features/domains/actions";
import {
  businessProfileFormSchema,
  competitorRowSchema,
  initialOnboardingActionState,
  manualQueryLineSchema,
  skipStepSchema,
  toLines,
  type OnboardingActionState,
} from "@/features/onboarding/schemas";
import {
  completionDestination,
  onboardingHref,
} from "@/features/onboarding/helpers";
import { recordAuditLog } from "@/server/repositories/audit-repository";
import { getDomainById, listDomains } from "@/server/repositories/domain-repository";
import {
  getBusinessProfile,
  insertCompetitors,
  insertPrompts,
  upsertBusinessProfile,
} from "@/server/repositories/discovery-repository";
import { getMembershipForUser } from "@/server/repositories/workspace-repository";
import { deriveQuerySuggestions } from "@/server/services/discovery/inference";
import type { Industry, QueryPriority } from "@/server/services/discovery/fixtures";
import {
  completeOnboarding,
  getOnboardingView,
  setOnboardingStep,
} from "@/server/services/onboarding-service";
import { runDomainAnalysis } from "@/server/services/site-analysis-service";

/**
 * Onboarding actions (Phase 2).
 *
 * Every action re-derives the workspace from the SIGNED-IN USER; any
 * client-supplied ids (domainId, callbackUrl, suggestions) are treated as
 * untrusted and re-validated server-side. Redirects happen outside try/catch
 * (or are rethrown) so Next.js navigation is never swallowed.
 */

async function requireWorkspace(): Promise<{ userId: string; workspaceId: string }> {
  const user = await requireUserContext();
  const membership = await getMembershipForUser(user.id);
  if (!membership) {
    throw new Error("No workspace is associated with this account.");
  }
  return { userId: user.id, workspaceId: membership.workspace.id };
}

/** Resolves a domain id and verifies it belongs to the caller's workspace. */
async function requireWorkspaceDomain(
  workspaceId: string,
  rawDomainId: unknown
): Promise<{ id: string; normalizedDomain: string } | null> {
  const domainId = String(rawDomainId ?? "");
  if (!domainId) return null;
  const domain = await getDomainById(workspaceId, domainId);
  if (!domain) return null;
  return { id: domain.id, normalizedDomain: domain.normalizedDomain };
}

function fieldErrorsFrom(issues: Array<{ path: PropertyKey[]; message: string }>): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

// ---------------------------------------------------------------------------
// Step 1: website
// ---------------------------------------------------------------------------

/**
 * Adds the website (delegating to the hardened domain action for quota,
 * duplicate and normalization handling) and advances onboarding to the
 * analyze step.
 */
export async function addWebsiteAction(
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const result = await createDomainAction(initialOnboardingActionState, formData);
  if (result.status !== "success") return result;

  try {
    const { userId, workspaceId } = await requireWorkspace();
    const rawDomain = String(formData.get("domain") ?? "");
    let normalized: string;
    try {
      normalized = normalizeDomain(rawDomain);
    } catch {
      const latest = await listDomains(workspaceId);
      normalized = latest.at(-1)?.normalizedDomain ?? "";
    }
    const domain = (await listDomains(workspaceId))
      .filter((candidate) => candidate.normalizedDomain === normalized)
      .at(-1);
    if (!domain) return result; // extremely unlikely; the domain still exists

    await setOnboardingStep(workspaceId, "analyzing", { domainId: domain.id });
    await recordAuditLog({
      userId,
      workspaceId,
      action: "onboarding.website_added",
      targetType: "domain",
      targetId: domain.id,
    });
    revalidatePath("/onboarding");
    return result;
  } catch (error) {
    if (isNextNavigationError(error)) throw error;
    reportError(error, { action: "addWebsite" });
    return result; // domain was added; the wizard self-heals on next load
  }
}

// ---------------------------------------------------------------------------
// Step 2: analyze (SSRF-guarded crawl + mocked inference)
// ---------------------------------------------------------------------------

export async function startAnalysisAction(
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  let callbackUrl = "/dashboard";
  try {
    const { userId, workspaceId } = await requireWorkspace();
    // "" fallback = "no deep link": intermediate redirects go to /onboarding
    // (onboardingHref), completion lands on the domain overview
    // (completionDestination) instead of the dashboard.
    callbackUrl = safeCallbackUrl(String(formData.get("callbackUrl") ?? ""), "");
    const domain = await requireWorkspaceDomain(workspaceId, formData.get("domainId"));
    if (!domain) {
      return { status: "error", message: "Domain not found. Add your website again." };
    }

    // Crawls burn bandwidth and (later) provider credits — one bucket per
    // workspace, capped by the existing MAX_DOMAIN_SCANS_PER_DAY guard.
    const limit = await rateLimit({
      key: `domain:crawl:ws:${workspaceId}`,
      limit: env.MAX_DOMAIN_SCANS_PER_DAY,
      windowSeconds: 86400,
    });
    if (!limit.allowed) {
      return {
        status: "error",
        message: "Daily analysis limit reached. Continue with manual setup, or try again tomorrow.",
      };
    }

    const outcome = await runDomainAnalysis({
      workspaceId,
      domain: { id: domain.id, normalizedDomain: domain.normalizedDomain },
    });

    if (outcome.status === "failed") {
      await recordAuditLog({
        userId,
        workspaceId,
        action: "onboarding.crawl_failed",
        targetType: "domain",
        targetId: domain.id,
        metadata: { jobId: outcome.jobId, error: outcome.error },
      });
      return {
        status: "error",
        message: `${outcome.error ?? "The crawl failed."} You can retry, or skip analysis and enter your details manually.`,
      };
    }

    // Persist the crawl-derived suggestion for resume (never overwriting a
    // user-confirmed profile).
    const existingProfile = await getBusinessProfile(workspaceId);
    if (outcome.suggestion && existingProfile?.source !== "manual") {
      try {
        await upsertBusinessProfile({
          workspaceId,
          domainId: domain.id,
          name: outcome.suggestion.name,
          tagline: outcome.suggestion.tagline,
          description: outcome.suggestion.description,
          industry: outcome.suggestion.industry,
          audience: outcome.suggestion.audience,
          products: outcome.suggestion.products,
          keywords: outcome.suggestion.keywords,
          source: "crawl",
        });
      } catch (error) {
        reportError(error, { action: "startAnalysis.persistSuggestion" });
      }
    }

    await setOnboardingStep(workspaceId, "business", { completed: ["analyzing"] });
    await recordAuditLog({
      userId,
      workspaceId,
      action: "onboarding.analysis_completed",
      targetType: "domain",
      targetId: domain.id,
      metadata: {
        jobId: outcome.jobId,
        pagesCrawled: outcome.pagesCrawled,
        pagesRead: outcome.pagesRead,
        pagesBlocked: outcome.pagesBlocked,
        mocked: outcome.mocked,
        hasSuggestion: outcome.suggestion !== null,
      },
    });
    revalidatePath("/onboarding");
  } catch (error) {
    if (isNextNavigationError(error)) throw error;
    reportError(error, { action: "startAnalysis" });
    return { status: "error", message: "Analysis failed unexpectedly. Retry, or set up manually." };
  }
  redirect(onboardingHref(callbackUrl));
}

// ---------------------------------------------------------------------------
// Step 3: business profile (manual confirmation of suggestions)
// ---------------------------------------------------------------------------

export async function saveBusinessProfileAction(
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  let callbackUrl = "/dashboard";
  try {
    const { userId, workspaceId } = await requireWorkspace();
    // "" fallback = "no deep link": intermediate redirects go to /onboarding
    // (onboardingHref), completion lands on the domain overview
    // (completionDestination) instead of the dashboard.
    callbackUrl = safeCallbackUrl(String(formData.get("callbackUrl") ?? ""), "");

    const parsed = businessProfileFormSchema.safeParse({
      name: formData.get("name") ?? "",
      tagline: formData.get("tagline") ?? "",
      description: formData.get("description") ?? "",
      industry: formData.get("industry") ?? "other",
      audience: formData.get("audience") ?? "",
      products: toLines(String(formData.get("products") ?? "")).slice(0, 8),
    });
    if (!parsed.success) {
      return {
        status: "error",
        message: "Please fix the highlighted fields.",
        fieldErrors: fieldErrorsFrom(parsed.error.issues),
      };
    }

    // Provenance only: a foreign/unknown domainId is ignored, never trusted.
    const domain = await requireWorkspaceDomain(workspaceId, formData.get("domainId"));
    if (!domain) {
      return { status: "error", message: "Domain not found. Add your website again." };
    }

    await upsertBusinessProfile({
      workspaceId,
      domainId: domain.id,
      name: parsed.data.name,
      tagline: parsed.data.tagline || null,
      description: parsed.data.description || null,
      industry: parsed.data.industry,
      audience: parsed.data.audience || null,
      products: parsed.data.products,
      keywords: (await getBusinessProfile(workspaceId))?.keywords ?? [],
      source: "manual",
    });

    await setOnboardingStep(workspaceId, "competitors", { completed: ["business"] });
    await recordAuditLog({
      userId,
      workspaceId,
      action: "onboarding.business_profile_saved",
      targetType: "workspace",
      targetId: workspaceId,
      metadata: { industry: parsed.data.industry, products: parsed.data.products.length },
    });
    revalidatePath("/onboarding");
  } catch (error) {
    if (isNextNavigationError(error)) throw error;
    reportError(error, { action: "saveBusinessProfile" });
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  redirect(onboardingHref(callbackUrl));
}

// ---------------------------------------------------------------------------
// Step 4: competitors (manual entries; suggestions are discovery aids only)
// ---------------------------------------------------------------------------

export async function saveCompetitorsAction(
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  let callbackUrl = "/dashboard";
  try {
    const { userId, workspaceId } = await requireWorkspace();
    // "" fallback = "no deep link": intermediate redirects go to /onboarding
    // (onboardingHref), completion lands on the domain overview
    // (completionDestination) instead of the dashboard.
    callbackUrl = safeCallbackUrl(String(formData.get("callbackUrl") ?? ""), "");
    const domain = await requireWorkspaceDomain(workspaceId, formData.get("domainId"));
    if (!domain) {
      return { status: "error", message: "Domain not found. Add your website again." };
    }

    const names = formData.getAll("competitorName").map((value) => String(value).trim());
    const rawDomains = formData.getAll("competitorDomain").map((value) => String(value).trim());
    const entries: Array<{ name: string; domain: string; normalizedDomain: string }> = [];
    const invalid: string[] = [];
    const seen = new Set<string>();

    for (let index = 0; index < Math.min(names.length, rawDomains.length); index += 1) {
      const name = names[index] ?? "";
      const rawDomain = rawDomains[index] ?? "";
      if (!name && !rawDomain) continue; // empty row — ignore
      const row = competitorRowSchema.safeParse({ name, domain: rawDomain });
      if (!row.success) {
        invalid.push(`Row ${index + 1}: ${row.error.issues[0]?.message ?? "invalid"}`);
        continue;
      }
      let normalized: string;
      try {
        normalized = normalizeDomain(row.data.domain);
      } catch (error) {
        invalid.push(`Row ${index + 1}: ${(error as Error).message}`);
        continue;
      }
      if (seen.has(normalized) || normalized === domain.normalizedDomain) continue;
      seen.add(normalized);
      entries.push({ name: row.data.name, domain: normalized, normalizedDomain: normalized });
      if (entries.length >= 20) break;
    }

    if (invalid.length > 0) {
      return { status: "error", message: invalid.join(" · "), fieldErrors: { competitors: invalid } };
    }

    const inserted = await insertCompetitors(domain.id, entries);
    await setOnboardingStep(workspaceId, "queries", { completed: ["competitors"] });
    await recordAuditLog({
      userId,
      workspaceId,
      action: "onboarding.competitors_saved",
      targetType: "domain",
      targetId: domain.id,
      metadata: { submitted: entries.length, inserted },
    });
    revalidatePath("/onboarding");
  } catch (error) {
    if (isNextNavigationError(error)) throw error;
    reportError(error, { action: "saveCompetitors" });
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  redirect(onboardingHref(callbackUrl));
}

// ---------------------------------------------------------------------------
// Step 5: queries (accept suggestions and/or add manually) → completed
// ---------------------------------------------------------------------------

const PRIORITY_TO_IMPORTANCE: Record<QueryPriority, number> = { LOW: 1, MEDIUM: 3, HIGH: 5 };

export async function saveQueriesAction(
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  let callbackUrl = "/dashboard";
  let destination: string | null = null;
  try {
    const { userId, workspaceId } = await requireWorkspace();
    // "" fallback = "no deep link": intermediate redirects go to /onboarding
    // (onboardingHref), completion lands on the domain overview
    // (completionDestination) instead of the dashboard.
    callbackUrl = safeCallbackUrl(String(formData.get("callbackUrl") ?? ""), "");
    const domain = await requireWorkspaceDomain(workspaceId, formData.get("domainId"));
    if (!domain) {
      return { status: "error", message: "Domain not found. Add your website again." };
    }

    // Accepted suggestions are re-derived server-side from the saved profile:
    // checked boxes only SELECT from this list, so tampered form values can
    // never inject metadata we did not generate.
    const profile = await getBusinessProfile(workspaceId);
    const suggestions = deriveQuerySuggestions({
      brand: profile?.name ?? domainToDisplayName(domain.normalizedDomain),
      industry: (profile?.industry as Industry | null) ?? "other",
      keywords: profile?.keywords ?? [],
    });
    const acceptedTexts = new Set(
      formData
        .getAll("acceptedQuery")
        .map((value) => String(value).trim())
        .filter(Boolean)
    );

    const manualLines = formData
      .getAll("manualQuery")
      .flatMap((value) => toLines(String(value)))
      .map((line) => manualQueryLineSchema.safeParse(line))
      .filter((result) => result.success)
      .map((result) => (result as { data: string }).data);

    const items: Array<{
      text: string;
      normalizedText: string;
      intent: (typeof suggestions.queries)[number]["intent"] | null;
      funnelStage: (typeof suggestions.queries)[number]["funnelStage"] | null;
      importance: number | null;
      source: "generated" | "manual";
    }> = [];
    const seen = new Set<string>();
    const push = (item: (typeof items)[number]) => {
      const key = item.normalizedText;
      if (seen.has(key)) return;
      if (items.length >= 40) return;
      seen.add(key);
      items.push(item);
    };

    for (const suggestion of suggestions.queries) {
      if (!acceptedTexts.has(suggestion.text)) continue;
      push({
        text: suggestion.text,
        normalizedText: suggestion.text.toLowerCase().replace(/\s+/g, " ").trim(),
        intent: suggestion.intent,
        funnelStage: suggestion.funnelStage,
        importance: PRIORITY_TO_IMPORTANCE[suggestion.priority],
        source: "generated",
      });
    }
    for (const line of manualLines) {
      push({
        text: line,
        normalizedText: line.toLowerCase().replace(/\s+/g, " ").trim(),
        intent: null,
        funnelStage: null,
        importance: null, // no discovery basis — never guess a priority
        source: "manual",
      });
    }

    const inserted = await insertPrompts(
      domain.id,
      items.map((item) => ({
        text: item.text,
        normalizedText: item.normalizedText,
        intent: item.intent ?? undefined,
        funnelStage: item.funnelStage ?? undefined,
        importance: item.importance,
        source: item.source,
      }))
    );

    await completeOnboarding(workspaceId, { domainId: domain.id });
    await recordAuditLog({
      userId,
      workspaceId,
      action: "onboarding.completed",
      targetType: "domain",
      targetId: domain.id,
      metadata: { submitted: items.length, inserted },
    });
    revalidatePath("/onboarding");
    revalidatePath("/domains");
    destination = completionDestination(callbackUrl, domain.id);
  } catch (error) {
    if (isNextNavigationError(error)) throw error;
    reportError(error, { action: "saveQueries" });
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  redirect(destination ?? completionDestination(callbackUrl, null));
}

// ---------------------------------------------------------------------------
// Manual fallback: skip any step (skipping the last one completes setup)
// ---------------------------------------------------------------------------

export async function skipStepAction(
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  let callbackUrl = "/dashboard";
  let destination: string | null = null;
  try {
    const { userId, workspaceId } = await requireWorkspace();
    // "" fallback = "no deep link": intermediate redirects go to /onboarding
    // (onboardingHref), completion lands on the domain overview
    // (completionDestination) instead of the dashboard.
    callbackUrl = safeCallbackUrl(String(formData.get("callbackUrl") ?? ""), "");

    const parsedStep = skipStepSchema.safeParse(formData.get("step"));
    if (!parsedStep.success) {
      return { status: "error", message: "Unknown step." };
    }
    const step = parsedStep.data;
    const view = await getOnboardingView(userId);
    const domainId = view?.domainId ?? null;

    if (step === "queries") {
      await completeOnboarding(workspaceId, { domainId });
      await recordAuditLog({
        userId,
        workspaceId,
        action: "onboarding.completed",
        targetType: "workspace",
        targetId: workspaceId,
        metadata: { skippedToCompletion: true },
      });
      revalidatePath("/onboarding");
      destination = completionDestination(callbackUrl, domainId);
    } else {
      const nextStep = step === "analyzing" ? "business" : step === "business" ? "competitors" : "queries";
      await setOnboardingStep(workspaceId, nextStep, { completed: [step] });
      await recordAuditLog({
        userId,
        workspaceId,
        action: "onboarding.step_skipped",
        targetType: "workspace",
        targetId: workspaceId,
        metadata: { step },
      });
      revalidatePath("/onboarding");
    }
  } catch (error) {
    if (isNextNavigationError(error)) throw error;
    reportError(error, { action: "skipStep" });
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  redirect(destination ?? onboardingHref(callbackUrl));
}
