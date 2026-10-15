/**
 * In-process metrics registry.
 *
 * Lightweight counters/timers for observability: provider latency, provider
 * failures, cache hit rate, AI parse failures, scan duration. Values are
 * aggregated in memory and exposed through `/api/health` (admin detail) so we
 * get signal without adding a paid monitoring vendor.
 *
 * When a durable metrics store is introduced later, only this module needs
 * to change.
 */

export interface MetricSnapshot {
  count: number;
  sum: number;
  max: number;
  avg: number;
}

type MetricEntry = { count: number; sum: number; max: number };

const registry = new Map<string, MetricEntry>();

function buildKey(name: string, tags?: Record<string, string>): string {
  if (!tags || Object.keys(tags).length === 0) return name;
  const tagPart = Object.entries(tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
  return `${name}{${tagPart}}`;
}

function record(key: string, value: number): void {
  const entry = registry.get(key);
  if (entry) {
    entry.count += 1;
    entry.sum += value;
    entry.max = Math.max(entry.max, value);
    return;
  }
  registry.set(key, { count: 1, sum: value, max: value });
}

export const metrics = {
  /** Count an occurrence (e.g., provider failure, cache miss). */
  increment(name: string, tags?: Record<string, string>, by = 1): void {
    record(buildKey(name, tags), by);
  },

  /** Observe a duration in milliseconds (e.g., provider latency). */
  observe(name: string, valueMs: number, tags?: Record<string, string>): void {
    record(buildKey(name, tags), valueMs);
  },

  /** Measure the duration of a function call and record it. */
  async time<T>(
    name: string,
    fn: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> {
    const started = performance.now();
    try {
      return await fn();
    } finally {
      metrics.observe(name, performance.now() - started, tags);
    }
  },

  /** Point-in-time view of all metrics (used by the health endpoint). */
  snapshot(): Record<string, MetricSnapshot> {
    const result: Record<string, MetricSnapshot> = {};
    for (const [key, entry] of registry.entries()) {
      result[key] = {
        count: entry.count,
        sum: Math.round(entry.sum * 100) / 100,
        max: Math.round(entry.max * 100) / 100,
        avg: Math.round((entry.sum / entry.count) * 100) / 100,
      };
    }
    return result;
  },

  /** Test helper. */
  reset(): void {
    registry.clear();
  },
};
