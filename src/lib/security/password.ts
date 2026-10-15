import bcrypt from "bcryptjs";

/**
 * Password hashing (bcrypt, cost factor configurable).
 *
 * The hash algorithm and cost are embedded in the stored string, so cost
 * factor upgrades can be rolled out incrementally later.
 */

const DEFAULT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, DEFAULT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/** Password policy shared by signup and password reset forms. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function isStrongEnoughPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}
