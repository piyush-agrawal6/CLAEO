"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ConfigurationError, reportError } from "@/lib/errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { getDb } from "@/lib/db";
import { domains, recommendations } from "@/lib/db/schema";
import {
  cancelScan,
  createAndRunScan,
  resumeScan,
} from "@/server/services/scan";
import { recordAuditLog } from "@/server/repositories/audit-repository";
import { requireWorkspaceContext } from "@/features/intelligence/context";
import type { IntelligenceActionState } from "@/features/intelligence/schemas";

/**
 * Scan lifecycle actions.
 *
 * A scan is a PAID, user-triggered operation. These actions are the ONLY
 * entry point — nothing scans on page load, login, navigation or startup.
 * Every start is rate-limited against the workspace's plan allowance
 * (scansPerDay) before a single provider request is planned.
 */

const startScanSchema = z.object({
  domainId: z.string().min(1, "Pick a domain to scan."),
  /** Two-step confirmation from the launcher; required server-side too. */
  confirm: z.literal("yes"),
});

export async function startScanAction(
  _prev: IntelligenceActionState,
  formData: FormData
): Promise<IntelligenceActionState> {
  const parsed = startScanSchema.safeParse({
    domainId: formData.get("domainId"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]?.message ??
        "Confirm the scan to run paid checks.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { userId, workspaceId, limits } = await requireWorkspaceContext();

    const budget = await rateLimit({
      key: `scan_start:${workspaceId}`,
      limit: limits.scansPerDay,
      windowSeconds: 24 * 60 * 60,
    });
    if (!budget.allowed) {
      return {
        status: "error",
        message: `Your plan allows ${limits.scansPerDay} scan(s) per day. Try again tomorrow or upgrade.`,
      };
    }

    const result = await createAndRunScan({
      workspaceId,
      domainId: parsed.data.domainId,
    });

    await recordAuditLog({
      userId,
      workspaceId,
      action: "scan.started",
      targetType: "intelligence_scan",
      targetId: result.scanId,
    });

    revalidatePath("/dashboard");
    revalidatePath("/ai-visibility");
    revalidatePath("/actions");

    return {
      status: "success",
      message:
        result.status === "completed"
          ? "Scan finished — scores and actions are up to date."
          : `Scan ${result.status}. Open AI Visibility to review the data collected so far.`,
    };
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return { status: "error", message: error.message };
    }
    reportError(error, { action: "startScan" });
    return {
      status: "error",
      message: "The scan could not be started. Nothing was charged twice.",
    };
  }
}

const scanRefSchema = z.object({ scanId: z.string().min(1) });

export async function resumeScanAction(
  _prev: IntelligenceActionState,
  formData: FormData
): Promise<IntelligenceActionState> {
  const parsed = scanRefSchema.safeParse({ scanId: formData.get("scanId") });
  if (!parsed.success) {
    return { status: "error", message: "Missing scan reference." };
  }
  try {
    const { workspaceId } = await requireWorkspaceContext();
    const budget = await rateLimit({
      key: `scan_resume:${workspaceId}`,
      limit: 30,
      windowSeconds: 60 * 60,
    });
    if (!budget.allowed) {
      return { status: "error", message: "Too many resume attempts — wait a minute." };
    }
    const result = await resumeScan({
      workspaceId,
      scanId: parsed.data.scanId,
    });
    revalidatePath("/dashboard");
    revalidatePath("/ai-visibility");
    return {
      status: "success",
      message: result.status === "completed" ? "Scan finished." : `Scan ${result.status}.`,
    };
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return { status: "error", message: error.message };
    }
    reportError(error, { action: "resumeScan" });
    return { status: "error", message: "Could not resume the scan." };
  }
}

export async function cancelScanAction(
  _prev: IntelligenceActionState,
  formData: FormData
): Promise<IntelligenceActionState> {
  const parsed = scanRefSchema.safeParse({ scanId: formData.get("scanId") });
  if (!parsed.success) {
    return { status: "error", message: "Missing scan reference." };
  }
  try {
    const { userId, workspaceId } = await requireWorkspaceContext();
    const result = await cancelScan({
      workspaceId,
      scanId: parsed.data.scanId,
    });
    if (result.cancelled) {
      await recordAuditLog({
        userId,
        workspaceId,
        action: "scan.cancelled",
        targetType: "intelligence_scan",
        targetId: result.scanId,
      });
    }
    revalidatePath("/dashboard");
    revalidatePath("/ai-visibility");
    return {
      status: "success",
      message: result.cancelled
        ? "Scan cancelled. Data already collected is kept."
        : "That scan is no longer running.",
    };
  } catch (error) {
    reportError(error, { action: "cancelScan" });
    return { status: "error", message: "Could not cancel the scan." };
  }
}

/* --------------------------- action center --------------------------- */

const recommendationStateSchema = z.object({
  recommendationId: z.string().min(1),
  status: z.enum(["open", "dismissed", "done"]),
});

/**
 * Manual state transitions for recommendations. Scoped by joining through
 * the workspace's domains — a foreign recommendation id updates nothing.
 */
export async function setRecommendationStatusAction(
  _prev: IntelligenceActionState,
  formData: FormData
): Promise<IntelligenceActionState> {
  const parsed = recommendationStateSchema.safeParse({
    recommendationId: formData.get("recommendationId"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Invalid recommendation reference." };
  }
  try {
    const { userId, workspaceId } = await requireWorkspaceContext();
    const db = getDb();

    const [row] = await db
      .select({ id: recommendations.id })
      .from(recommendations)
      .innerJoin(domains, eq(domains.id, recommendations.domainId))
      .where(
        and(
          eq(recommendations.id, parsed.data.recommendationId),
          eq(domains.workspaceId, workspaceId)
        )
      )
      .limit(1);
    if (!row) {
      return { status: "error", message: "Recommendation not found." };
    }

    await db
      .update(recommendations)
      .set({ status: parsed.data.status })
      .where(eq(recommendations.id, row.id));

    await recordAuditLog({
      userId,
      workspaceId,
      action: `recommendation.${parsed.data.status}`,
      targetType: "recommendation",
      targetId: row.id,
    });
    revalidatePath("/actions");
    return { status: "success", message: "Updated." };
  } catch (error) {
    reportError(error, { action: "setRecommendationStatus" });
    return { status: "error", message: "Could not update the recommendation." };
  }
}
