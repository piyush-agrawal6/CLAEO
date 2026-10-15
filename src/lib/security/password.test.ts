import { describe, expect, it } from "vitest";
import {
  hashPassword,
  isStrongEnoughPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from "@/lib/security/password";

describe("password hashing", () => {
  it("hashes and verifies correctly", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse");
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt format with cost embedded
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a unique salt per hash", async () => {
    const a = await hashPassword("same-password-123");
    const b = await hashPassword("same-password-123");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password-123", a)).toBe(true);
    expect(await verifyPassword("same-password-123", b)).toBe(true);
  });

  it("returns false instead of throwing for malformed hashes", async () => {
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
  });
});

describe("password policy", () => {
  it("accepts passwords within the length bounds", () => {
    expect(isStrongEnoughPassword("a".repeat(PASSWORD_MIN_LENGTH))).toBe(true);
    expect(isStrongEnoughPassword("a".repeat(PASSWORD_MAX_LENGTH))).toBe(true);
  });

  it("rejects too-short and too-long passwords", () => {
    expect(isStrongEnoughPassword("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
    expect(isStrongEnoughPassword("a".repeat(PASSWORD_MAX_LENGTH + 1))).toBe(false);
    expect(isStrongEnoughPassword("")).toBe(false);
  });
});
