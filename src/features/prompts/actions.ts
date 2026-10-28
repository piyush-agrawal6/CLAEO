"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { reportError } from "@/lib/errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { getDb } from "@/lib/db";
import { domains, prompts } from "@/lib/db/schema";
import { recordAuditLog } from "@/server/repositories/audit-repository";
import { requireWorkspaceContext } from "@/features/intelligence/context";
import type { IntelligenceActionState } from "@/features/intelligence/schemas";

/**
 * Prompt management actions.
 *
 * Prompts are the questions the product tracks. Caps come from the
 * centralized plan limits (free: 10) — enforced here, before any insert.
 */

function normalizePromptText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

async function requireOwnedDomain(domainId: string, workspaceId: string) {
  const [domain] = await getDb()
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.workspaceId, workspaceId)))
    .limit(1);
  return domain ?? null;
}

const createPromptSchema = z.object({
  domainId: z.string().min(1),
  text: z
    .string()
    .trim()
    .min(4, "Prompts must be at least 4 characters.")
    .max(500, "Prompts are limited to 500 characters."),
  intent: z.enum(["informational", "commercial", "transactional", "comparison", "brand"]).optional(),
  funnelStage: z.enum(["awareness", "consideration", "decision", "brand"]).optional(),
  importance: z.coerce.number().int().min(1).max(5).optional(),
});

export async function createPromptAction(
  _prev: IntelligenceActionState,
  formData: FormData
): Promise<IntelligenceActionState> {
  const parsed = createPromptSchema.safeParse({
    domainId: formData.get("domainId"),
    text: formData.get("text"),
    intent: formData.get("intent") || undefined,
    funnelStage: formData.get("funnelStage") || undefined,
    importance: formData.get("importance") || undefined,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid prompt.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { userId, workspaceId, limits } = await requireWorkspaceContext();
    const db = getDb();

    const domain = await requireOwnedDomain(parsed.data.domainId, workspaceId);
    if (!domain) {
      return { status: "error", message: "Domain not found for this workspace." };
    }

    const budget = await rateLimit({
      key: `prompt_create:${workspaceId}`,
      limit: 30,
      windowSeconds: 60 * 60,
    });
    if (!budget.allowed) {
      return { status: "error", message: "Too many prompt changes — wait a minute." };
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(prompts)
      .where(eq(prompts.domainId, domain.id));
    if ((count ?? 0) >= limits.prompts) {
      return {
        status: "error",
        message: `Your plan tracks up to ${limits.prompts} prompts. Remove one or upgrade to add more.`,
      };
    }

    const normalized = normalizePromptText(parsed.data.text);
    const [existing] = await db
      .select({ id: prompts.id })
      .from(prompts)
      .where(and(eq(prompts.domainId, domain.id), eq(prompts.normalizedText, normalized)))
      .limit(1);
    if (existing) {
      return { status: "error", message: "That question is already being tracked." };
    }

    const [created] = await db
      .insert(prompts)
      .values({
        domainId: domain.id,
        text: parsed.data.text.trim(),
        normalizedText: normalized,
        intent: parsed.data.intent ?? null,
        funnelStage: parsed.data.funnelStage ?? null,
        importance: parsed.data.importance ?? null,
        source: "manual",
        enabled: true,
      })
      .returning({ id: prompts.id });

    await recordAuditLog({
      userId,
      workspaceId,
      action: "prompt.created",
      targetType: "prompt",
      targetId: created!.id,
    });
    revalidatePath("/prompts");
    revalidatePath("/dashboard");
    return { status: "success", message: "Prompt added." };
  } catch (error) {
    reportError(error, { action: "createPrompt" });
    return { status: "error", message: "Could not add the prompt." };
  }
}

const promptRefSchema = z.object({
  promptId: z.string().min(1),
  enabled: z.enum(["true", "false"]),
});

export async function togglePromptAction(
  _prev: IntelligenceActionState,
  formData: FormData
): Promise<IntelligenceActionState> {
  const parsed = promptRefSchema.safeParse({
    promptId: formData.get("promptId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success || !parsed.data.enabled) {
    return { status: "error", message: "Invalid prompt reference." };
  }
  try {
    const { userId, workspaceId } = await requireWorkspaceContext();
    const db = getDb();
    const [updated] = await db
      .update(prompts)
      .set({ enabled: parsed.data.enabled === "true" })
      .where(
        and(
          eq(prompts.id, parsed.data.promptId),
          inArray(
            prompts.domainId,
            db.select({ id: domains.id }).from(domains).where(eq(domains.workspaceId, workspaceId))
          )
        )
      )
      .returning({ id: prompts.id });
    if (!updated) {
      return { status: "error", message: "Prompt not found for this workspace." };
    }
    await recordAuditLog({
      userId,
      workspaceId,
      action: parsed.data.enabled === "true" ? "prompt.enabled" : "prompt.disabled",
      targetType: "prompt",
      targetId: updated.id,
    });
    revalidatePath("/prompts");
    return { status: "success", message: "Updated." };
  } catch (error) {
    reportError(error, { action: "togglePrompt" });
    return { status: "error", message: "Could not update the prompt." };
  }
}

export async function deletePromptAction(
  _prev: IntelligenceActionState,
  formData: FormData
): Promise<IntelligenceActionState> {
  const parsed = promptRefSchema.safeParse({ promptId: formData.get("promptId") });
  if (!parsed.success) {
    return { status: "error", message: "Invalid prompt reference." };
  }
  try {
    const { userId, workspaceId } = await requireWorkspaceContext();
    const db = getDb();
    const [deleted] = await db
      .delete(prompts)
      .where(
        and(
          eq(prompts.id, parsed.data.promptId),
          inArray(
            prompts.domainId,
            db.select({ id: domains.id }).from(domains).where(eq(domains.workspaceId, workspaceId))
          )
        )
      )
      .returning({ id: prompts.id });
    if (!deleted) {
      return { status: "error", message: "Prompt not found for this workspace." };
    }
    await recordAuditLog({
      userId,
      workspaceId,
      action: "prompt.deleted",
      targetType: "prompt",
      targetId: deleted.id,
    });
    revalidatePath("/prompts");
    revalidatePath("/dashboard");
    return { status: "success", message: "Prompt removed." };
  } catch (error) {
    reportError(error, { action: "deletePrompt" });
    return { status: "error", message: "Could not remove the prompt." };
  }
}
