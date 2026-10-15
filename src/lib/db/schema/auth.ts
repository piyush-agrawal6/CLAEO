import { integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * Auth.js (next-auth) tables + application password credentials.
 *
 * - `users` extends the Auth.js shape with `passwordHash` and
 *   `sessionVersion` (bumped on password reset to invalidate old JWTs).
 * - `accounts` / `sessions` / `verificationTokens` are maintained by the
 *   Auth.js Drizzle adapter (OAuth + future database-session support).
 * - Email verification and password reset use application-managed, hashed,
 *   single-use tokens (see `server/services/token-service.ts`) stored in
 *   `verificationTokens` (email) and `passwordResetTokens` (reset).
 */

export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    /** bcrypt hash. Null for OAuth-only accounts. */
    passwordHash: text("password_hash"),
    /** Invalidates issued JWT sessions when it no longer matches the token. */
    sessionVersion: integer("session_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  }
);

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    unique("accounts_provider_provider_account_id_unique").on(
      table.provider,
      table.providerAccountId
    ),
  ]
);

export const sessions = pgTable("sessions", {
  // Auth.js requires the session token to be the primary key.
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

/** Raw tokens are never stored — only SHA-256 hashes. */
export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
