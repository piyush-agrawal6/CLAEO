import { countDomains } from "@/server/repositories/domain-repository";
import {
  getOnboardingState,
  upsertOnboardingState,
} from "@/server/repositories/onboarding-repository";
import { getMembershipForUser } from "@/server/repositories/workspace-repository";
import type { OnboardingStep } from "@/lib/db/schema";

/**
 * Onboarding state machine (Phase 2).
 *
 * Steps: website → analyzing → business → competitors → queries → completed.
 * State is PERSISTED per workspace (`onboarding_states`) so the flow is
 * resumable across sessions and devices. Every transition is written by
 * server actions only — the client can never set a step directly.
 *
 * Completion semantics (used by auth redirects via `isOnboardingComplete`):
 * - a workspace WITH a state row is complete only when the row says
 *   `completed` (deleting a domain later does not drag the user back)
 * - a workspace WITHOUT a state row keeps the Part A legacy behavior:
 *   complete once it has at least one domain (pre-existing workspaces are
 *   never forced back into the wizard)
 */

/** Steps that count as finished once onboarding is completed. */
export const PRE_COMPLETED_STEPS: OnboardingStep[] = [
  "website",
  "analyzing",
  "business",
  "competitors",
  "queries",
];

export interface OnboardingView {
  workspaceId: string;
  step: OnboardingStep;
  completedSteps: OnboardingStep[];
  domainId: string | null;
  /** False when derived without a persisted row (fresh workspace). */
  persisted: boolean;
}

/**
 * Normalizes a persisted row into the step the UI should actually show.
 * A deleted domain heals mid-flow steps back to `website`; `completed` is
 * sticky (finishing is an explicit user decision).
 */
function normalizeStep(step: OnboardingStep, domainId: string | null): OnboardingStep {
  if (step === "completed") return "completed";
  if (step === "website") return domainId ? "analyzing" : "website";
  return domainId ? step : "website";
}

/** Resolves the caller's onboarding view, or null when they have no workspace. */
export async function getOnboardingView(userId: string): Promise<OnboardingView | null> {
  const membership = await getMembershipForUser(userId);
  if (!membership) return null;
  const workspaceId = membership.workspace.id;

  const state = await getOnboardingState(workspaceId);
  if (!state) {
    return { workspaceId, step: "website", completedSteps: [], domainId: null, persisted: false };
  }
  return {
    workspaceId,
    step: normalizeStep(state.currentStep, state.domainId),
    completedSteps: state.completedSteps,
    domainId: state.domainId,
    persisted: true,
  };
}

/**
 * Advances (or creates) the persisted state. `completed` entries are merged
 * into the finished-steps list; omitting `domainId` keeps the current one.
 */
export async function setOnboardingStep(
  workspaceId: string,
  step: OnboardingStep,
  options: { domainId?: string | null; completed?: OnboardingStep[] } = {}
): Promise<OnboardingView> {
  const existing = await getOnboardingState(workspaceId);
  const completedSteps = Array.from(
    new Set([...(existing?.completedSteps ?? []), ...(options.completed ?? [])])
  );
  const domainId = options.domainId !== undefined ? options.domainId : (existing?.domainId ?? null);

  await upsertOnboardingState({ workspaceId, currentStep: step, completedSteps, domainId });
  return { workspaceId, step, completedSteps, domainId, persisted: true };
}

/** Marks onboarding finished (all pre-completion steps count as done). */
export async function completeOnboarding(
  workspaceId: string,
  options: { domainId?: string | null } = {}
): Promise<OnboardingView> {
  return setOnboardingStep(workspaceId, "completed", {
    completed: PRE_COMPLETED_STEPS,
    domainId: options.domainId,
  });
}

/**
 * Single integration point for auth redirects and the /onboarding page:
 * true when the workspace is past (or legacy-equivalent to past) setup.
 */
export async function isOnboardingComplete(userId: string): Promise<boolean> {
  const view = await getOnboardingView(userId);
  if (!view) return false;
  if (view.persisted) return view.step === "completed";
  const count = await countDomains(view.workspaceId);
  return count > 0;
}
