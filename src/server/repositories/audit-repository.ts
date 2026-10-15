import { getDb } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { logger } from "@/lib/logging/logger";
import { redact } from "@/lib/logging/logger";

/**
 * Security audit trail. Writes are best-effort: an audit failure never
 * breaks the business flow it is recording, but it is logged loudly.
 */

export interface RecordAuditLogInput {
  userId?: string | null;
  workspaceId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  try {
    const db = getDb();
    await db.insert(auditLogs).values({
      userId: input.userId ?? null,
      workspaceId: input.workspaceId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ? redact(input.metadata) : null,
    });
  } catch (error) {
    logger.error("Failed to write audit log", { error, action: input.action });
  }
}
