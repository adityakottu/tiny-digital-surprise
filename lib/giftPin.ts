/**
 * giftPin.ts — the lock on a gift link.
 *
 * The important property: the story is never sent to the browser until the
 * PIN has been checked on the server. A gate that ships the story and then
 * hides it with CSS or JavaScript is not a lock — anyone can read it out of
 * "view source" or the network tab, which is exactly the person most likely
 * to go looking for a surprise early.
 *
 * How unlocking is remembered: each locked gift gets a long random
 * `unlockToken` at creation. On a correct PIN the server sets that token in
 * an HttpOnly cookie scoped to the gift's own path, and afterwards a request
 * is considered unlocked when its cookie matches the token in the database.
 * That needs no signing secret and nothing new in the environment — the
 * database is already the source of truth, and the token only ever leaves
 * the server after a correct PIN.
 *
 * Honest limits, because this is security-adjacent:
 *
 *  - A date has very little entropy. "Their birthday" is four to eight
 *    digits and often guessable by exactly the people who know the couple.
 *    This keeps a surprise from being spoiled; it is not a secret-keeper.
 *  - Attempt throttling below is per server instance and in memory. On
 *    serverless it resets on a cold start and is not shared between
 *    instances, so it slows a casual guesser rather than a determined one.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

export type GiftPinType = "birthday" | "anniversary" | "custom";

/**
 * Normalises a PIN so the sender and the recipient do not have to agree on
 * punctuation. "25/12/2015", "25-12-2015" and "25122015" are the same PIN;
 * so are "Paris" and "paris".
 */
export function normalisePin(raw: string): string {
  return String(raw || "")
    .normalize("NFKD")
    .replace(/[^0-9a-zA-Z]/g, "")
    .toLowerCase();
}

/** Minimum after normalising. Short enough for DDMM, long enough to be a lock. */
export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 32;

export function validatePin(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = normalisePin(raw);
  if (value.length < MIN_PIN_LENGTH) {
    return { ok: false, error: `The PIN needs at least ${MIN_PIN_LENGTH} letters or numbers.` };
  }
  if (value.length > MAX_PIN_LENGTH) {
    return { ok: false, error: `The PIN can be at most ${MAX_PIN_LENGTH} characters.` };
  }
  return { ok: true, value };
}

/**
 * Hashes a PIN with a per-gift salt.
 *
 * scrypt rather than a bare SHA: the PIN space is tiny, so if the database
 * ever leaked, a fast hash would fall in seconds. This does not make a date
 * unguessable, but it stops the stored value being trivially reversible.
 */
export function hashPin(pin: string, salt: string): string {
  return scryptSync(normalisePin(pin), salt, 32).toString("hex");
}

export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

export function newUnlockToken(): string {
  return randomBytes(32).toString("hex");
}

/** Constant-time comparison, so a wrong PIN cannot be narrowed by timing. */
export function pinMatches(candidate: string, salt: string, expectedHash: string): boolean {
  if (!salt || !expectedHash) return false;
  const a = Buffer.from(hashPin(candidate, salt), "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Same comparison for the unlock cookie. */
export function tokenMatches(candidate: string | undefined, expected: string | null): boolean {
  if (!candidate || !expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The cookie name for one gift. Scoped per slug so one unlock is not all. */
export function unlockCookieName(slug: string): string {
  // Hashed so the cookie name does not itself leak which gift is being read
  // from a shared browser's cookie list.
  return "tds_u_" + createHash("sha256").update(slug).digest("hex").slice(0, 16);
}

/* ------------------------------------------------------------------ *
 * Attempt throttling
 * ------------------------------------------------------------------ */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

type Bucket = { count: number; first: number };
const attempts = new Map<string, Bucket>();

/**
 * Records a failed attempt and reports whether the caller is now locked out.
 * Keyed by gift and client, so one recipient guessing does not lock another.
 */
export function registerFailure(key: string): { lockedOut: boolean; remaining: number } {
  const now = Date.now();
  const bucket = attempts.get(key);
  if (!bucket || now - bucket.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
    return { lockedOut: false, remaining: MAX_ATTEMPTS - 1 };
  }
  bucket.count += 1;
  const remaining = Math.max(0, MAX_ATTEMPTS - bucket.count);
  return { lockedOut: bucket.count >= MAX_ATTEMPTS, remaining };
}

export function isLockedOut(key: string): boolean {
  const bucket = attempts.get(key);
  if (!bucket) return false;
  if (Date.now() - bucket.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return bucket.count >= MAX_ATTEMPTS;
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}

/** A default hint, used when the sender did not write their own. */
export function defaultHint(type: GiftPinType, length: number): string {
  if (type === "birthday") return `Your birthday — ${length} digits`;
  if (type === "anniversary") return `The date that started all this — ${length} digits`;
  return `${length} characters`;
}
