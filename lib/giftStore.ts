/**
 * giftStore.ts — where a test-mode gift lives.
 *
 * The real store is Prisma + SQLite, which is unusable for a test run on
 * Vercel: the schema's newer columns have no migration behind them, and the
 * database file sits on a disk that is thrown away on every cold start. So
 * test mode keeps gifts here instead, with no dependency of any kind.
 *
 * Two layers, because a serverless function's lifetime is short:
 *
 *  1. A Map hung off globalThis. Survives module re-evaluation inside one
 *     warm instance, and survives dev-server hot reloads.
 *  2. A JSON file per gift under the OS temp directory. Survives the module
 *     cache being dropped, and is what makes a link still work a few minutes
 *     later on the same instance.
 *
 * What neither layer survives is a cold start or a request routed to a
 * different instance — /tmp is per-instance and not shared. That is why the
 * details form also stashes the gift in the creator's own localStorage, and
 * /g/<slug> falls back to restoring from there (see app/g/[slug]/route.ts).
 * Between the three, a test gift reliably opens for the person who made it.
 *
 * Images are inlined as data URLs. They go in the JSON, so they are kept
 * small deliberately (see lib/inlineImage.ts) — a story with four memories
 * and two faces lands around a few hundred KB.
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";

export interface TestGiftPhoto {
  url: string;
  caption: string | null;
  filterApplied: string | null;
}

export interface TestMilestone {
  id: string;
  icon: string;
  title: string;
  text: string;
  photo?: string | null;
}

export interface TestGift {
  slug: string;
  recipientName: string;
  senderName: string | null;
  occasion: string | null;
  openingLine: string | null;
  message: string;
  oneMoreThing: string | null;
  songUrl: string | null;
  senderPhotoUrl: string | null;
  recipientPhotoUrl: string | null;
  pinHash: string | null;
  pinSalt: string | null;
  pinType: string | null;
  pinHint: string | null;
  pinLength: number | null;
  unlockToken: string | null;
  photos: TestGiftPhoto[];
  /** The sender's own timeline, or null to use the story's built-in six. */
  milestones: TestMilestone[] | null;
  createdAt: string;
  expiresAt: string;
}

const DIR = path.join(os.tmpdir(), "tds-test-gifts");

const globalForStore = globalThis as unknown as { __tdsTestGifts?: Map<string, TestGift> };
const memory: Map<string, TestGift> =
  globalForStore.__tdsTestGifts || (globalForStore.__tdsTestGifts = new Map());

/** Keeps a slug from reaching outside the store's own directory. */
function fileFor(slug: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(slug)) return null;
  return path.join(DIR, `${slug}.json`);
}

export async function saveTestGift(gift: TestGift): Promise<void> {
  memory.set(gift.slug, gift);
  const file = fileFor(gift.slug);
  if (!file) return;
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(file, JSON.stringify(gift), "utf-8");
  } catch (err) {
    // The Map above is enough to serve the link that was just created, so a
    // read-only or full temp directory degrades rather than fails.
    console.warn("[giftStore] could not persist test gift to disk:", err);
  }
}

export async function loadTestGift(slug: string): Promise<TestGift | null> {
  const cached = memory.get(slug);
  if (cached) return cached;

  const file = fileFor(slug);
  if (!file) return null;
  try {
    const gift = JSON.parse(await readFile(file, "utf-8")) as TestGift;
    memory.set(slug, gift);
    return gift;
  } catch {
    return null;
  }
}
