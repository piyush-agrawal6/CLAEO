import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";

/**
 * Redis abstraction (Upstash in production, in-memory fallback in dev/tests).
 *
 * Requirements it must serve:
 * - caching expensive provider results
 * - rate limiting (auth, public tools)
 * - usage/budget counters
 * - job coordination
 *
 * When Upstash is not configured we degrade to a per-process in-memory store
 * so local development and tests need zero external services. In-memory
 * mode is clearly not multi-instance-safe and is never used in production.
 */

export interface RedisClient {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { ex?: number }): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  /** Atomic INCR with EXPIRE for fixed-window counters (weighted by `amount`). */
  incrWithTtl(key: string, ttlSeconds: number, amount?: number): Promise<number>;
}

/* ------------------------------- in-memory ------------------------------- */

interface MemoryEntry {
  value: string;
  expiresAt: number | null;
}

export class InMemoryRedisClient implements RedisClient {
  private store = new Map<string, MemoryEntry>();

  private isExpired(entry: MemoryEntry): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= Date.now();
  }

  private read(key: string): MemoryEntry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.read(key);
    if (!entry) return null;
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return entry.value as unknown as T;
    }
  }

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<void> {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    this.store.set(key, {
      value: serialized,
      expiresAt: options?.ex ? Date.now() + options.ex * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async incr(key: string): Promise<number> {
    const entry = this.read(key);
    const current = entry ? Number(JSON.parse(entry.value)) || 0 : 0;
    const next = current + 1;
    this.store.set(key, { value: JSON.stringify(next), expiresAt: entry?.expiresAt ?? null });
    return next;
  }

  async expire(key: string, seconds: number): Promise<void> {
    const entry = this.read(key);
    if (entry) {
      entry.expiresAt = Date.now() + seconds * 1000;
    }
  }

  async incrWithTtl(key: string, ttlSeconds: number, amount = 1): Promise<number> {
    const entry = this.read(key);
    const current = entry ? Number(JSON.parse(entry.value)) || 0 : 0;
    const next = current + amount;
    const expiresAt =
      entry && entry.expiresAt ? entry.expiresAt : Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value: JSON.stringify(next), expiresAt });
    return next;
  }

  /** Test helper. */
  clear(): void {
    this.store.clear();
  }
}

/* -------------------------------- upstash -------------------------------- */

class UpstashRedisClient implements RedisClient {
  constructor(private redis: Redis) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = await this.redis.get<T>(key);
    return value ?? null;
  }

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<void> {
    if (options?.ex) {
      await this.redis.set(key, value, { ex: options.ex });
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.redis.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.redis.expire(key, seconds);
  }

  async incrWithTtl(key: string, ttlSeconds: number, amount = 1): Promise<number> {
    const pipeline = this.redis.pipeline();
    pipeline.incrby(key, amount);
    // Reset the window TTL on every increment; harmless for fixed windows.
    pipeline.expire(key, ttlSeconds);
    const results = await pipeline.exec();
    const [count] = results as [number];
    return count;
  }
}

/* -------------------------------- factory -------------------------------- */

let client: RedisClient | null = null;
let warnedAboutFallback = false;

export function isRedisConfigured(): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

export function getRedis(): RedisClient {
  if (client) return client;

  if (isRedisConfigured()) {
    client = new UpstashRedisClient(
      new Redis({
        url: env.UPSTASH_REDIS_REST_URL!,
        token: env.UPSTASH_REDIS_REST_TOKEN!,
      })
    );
    logger.info("Redis initialized (Upstash)");
  } else {
    client = new InMemoryRedisClient();
    if (!warnedAboutFallback && env.NODE_ENV !== "test") {
      warnedAboutFallback = true;
      logger.warn(
        "Upstash Redis is not configured — using a per-process in-memory store. " +
          "Rate limits and counters are not shared between instances and reset on restart."
      );
    }
  }

  return client;
}

/** Test-only: replace the singleton (e.g., with a fresh in-memory store). */
export function setRedisForTesting(redis: RedisClient | null): void {
  client = redis;
}

/**
 * Cache helper: read-through with JSON serialization. Returns `undefined` on
 * cache miss. Cache failures never break the caller.
 */
export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const value = await getRedis().get<T>(key);
    return value ?? undefined;
  } catch (error) {
    logger.warn("Cache read failed", { key, error });
    return undefined;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await getRedis().set(key, value, { ex: ttlSeconds });
  } catch (error) {
    logger.warn("Cache write failed", { key, error });
  }
}
