import { logger } from "@/lib/logging/logger";
import { metrics } from "@/lib/logging/metrics";

/**
 * Background job queue abstraction.
 *
 * Phase 0 ships an in-process queue so the interface exists and jobs are
 * written idempotently from day one. The production implementation (Vercel
 * cron + a DB-backed queue table) slots in here without touching call sites.
 *
 * Jobs MUST NOT run inside request handlers when they can take seconds
 * (scans, audits, syncs). Long jobs belong here.
 */

export interface JobDefinition<Payload> {
  name: string;
  handler: (payload: Payload) => Promise<void>;
}

export interface EnqueueOptions {
  /** Delay before execution, in ms (in-process queue only). */
  delayMs?: number;
}

export interface JobQueue {
  enqueue<Payload>(name: string, payload: Payload, options?: EnqueueOptions): Promise<string>;
}

/** In-process, non-durable queue. Dev/test only — never relied on in prod. */
class InProcessJobQueue implements JobQueue {
  private handlers = new Map<string, (payload: unknown) => Promise<void>>();

  register<Payload>(definition: JobDefinition<Payload>): void {
    this.handlers.set(definition.name, definition.handler as (payload: unknown) => Promise<void>);
  }

  async enqueue<Payload>(
    name: string,
    payload: Payload,
    options?: EnqueueOptions
  ): Promise<string> {
    const jobId = crypto.randomUUID();
    const handler = this.handlers.get(name);
    if (!handler) {
      logger.error("No handler registered for job", { job: name, jobId });
      throw new Error(`No handler registered for job "${name}"`);
    }

    const run = async () => {
      const started = performance.now();
      logger.info("Job started", { job: name, jobId });
      try {
        await handler(payload);
        metrics.observe("job.duration_ms", performance.now() - started, { job: name });
        metrics.increment("job.completed", { job: name });
        logger.info("Job completed", { job: name, jobId });
      } catch (error) {
        metrics.increment("job.failed", { job: name });
        logger.error("Job failed", { job: name, jobId, error });
      }
    };

    if (options?.delayMs && options.delayMs > 0) {
      setTimeout(run, options.delayMs);
    } else {
      // Fire and forget; errors are captured inside run().
      void run();
    }

    return jobId;
  }
}

export const inProcessQueue = new InProcessJobQueue();

export function getJobQueue(): JobQueue {
  // The durable queue implementation replaces this in the jobs phase.
  return inProcessQueue;
}
