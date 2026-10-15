import { logger } from "@/lib/logging/logger";

/**
 * Application error taxonomy.
 *
 * Every error that crosses an boundary (server action, API route) should be
 * an AppError subtype with:
 * - a stable machine-readable `code`
 * - an HTTP `statusCode`
 * - `expose: true` only when the message is safe to show to end users
 *
 * Raw provider errors must NEVER be exposed: wrap them in `ProviderError`
 * with a safe message and log the sanitized details separately.
 */

export type ErrorCode =
  | "validation_error"
  | "authentication_error"
  | "authorization_error"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "quota_exceeded"
  | "provider_error"
  | "provider_unavailable"
  | "configuration_error"
  | "internal_error";

export interface FieldIssue {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly expose: boolean;
  readonly details?: FieldIssue[];

  constructor(
    message: string,
    options: {
      code: ErrorCode;
      statusCode: number;
      expose?: boolean;
      details?: FieldIssue[];
      cause?: unknown;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.expose = options.expose ?? false;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Please check the provided values.", details?: FieldIssue[]) {
    super(message, { code: "validation_error", statusCode: 400, expose: true, details });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "You must be signed in to continue.") {
    super(message, { code: "authentication_error", statusCode: 401, expose: true });
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have access to this resource.") {
    super(message, { code: "authorization_error", statusCode: 403, expose: true });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found.") {
    super(message, { code: "not_found", statusCode: 404, expose: true });
  }
}

export class ConflictError extends AppError {
  constructor(message = "The resource already exists.") {
    super(message, { code: "conflict", statusCode: 409, expose: true });
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(message = "Too many requests. Please wait and try again.", retryAfterSeconds = 60) {
    super(message, { code: "rate_limited", statusCode: 429, expose: true });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class QuotaExceededError extends AppError {
  readonly scope: "user" | "workspace" | "provider" | "plan" | "budget";

  constructor(
    scope: QuotaExceededError["scope"],
    message = "You have reached a usage limit for your plan. Please try again later."
  ) {
    super(message, { code: "quota_exceeded", statusCode: 429, expose: true });
    this.scope = scope;
  }
}

export class ProviderError extends AppError {
  readonly provider: string;
  readonly operation: string;
  readonly retryable: boolean;

  constructor(
    provider: string,
    operation: string,
    options: { retryable?: boolean; cause?: unknown } = {}
  ) {
    // Safe, user-facing message: never include provider response bodies,
    // credentials, or URLs.
    super(`The ${provider} provider is currently unavailable.`, {
      code: "provider_error",
      statusCode: 502,
      expose: true,
      cause: options.cause,
    });
    this.provider = provider;
    this.operation = operation;
    this.retryable = options.retryable ?? true;
  }
}

export class ProviderUnavailableError extends AppError {
  readonly provider: string;

  constructor(provider: string, reason: string) {
    super(`The ${provider} provider is not available: ${reason}`, {
      code: "provider_unavailable",
      statusCode: 503,
      expose: true,
    });
    this.provider = provider;
  }
}

export class ConfigurationError extends AppError {
  constructor(message = "The server is misconfigured. Please contact support.") {
    super(message, { code: "configuration_error", statusCode: 500, expose: false });
  }
}

export class InternalError extends AppError {
  constructor(message = "Something went wrong. Please try again.", cause?: unknown) {
    super(message, { code: "internal_error", statusCode: 500, expose: false, cause });
  }
}

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

/** Extract a message that is safe to show to the current user. */
export function toSafeMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.expose ? error.message : GENERIC_MESSAGE;
  }
  return GENERIC_MESSAGE;
}

/** HTTP status for an error, defaulting to 500. */
export function toStatus(error: unknown): number {
  return error instanceof AppError ? error.statusCode : 500;
}

export interface SerializedApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: FieldIssue[];
  };
}

/**
 * Convert any error into a sanitized API response body. Full details are
 * logged server-side (redacted); the client only ever sees safe messages.
 */
export function toApiErrorResponse(
  error: unknown,
  context?: Record<string, unknown>
): { status: number; body: SerializedApiError } {
  reportError(error, context);
  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.expose ? error.message : GENERIC_MESSAGE,
          ...(error.details ? { details: error.details } : {}),
        },
      },
    };
  }
  return {
    status: 500,
    body: { error: { code: "internal_error", message: GENERIC_MESSAGE } },
  };
}

/** Log an error with context. Call this at every catch boundary. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (error instanceof AppError && error.statusCode < 500) {
    // Expected client-side problems (validation, auth) are logged lightly.
    logger.warn(error.message, {
      code: error.code,
      statusCode: error.statusCode,
      ...context,
    });
    return;
  }
  logger.error("Unhandled error", { error, ...context });
}
