/**
 * /api/gifts/restore — puts a test gift back on the server.
 *
 * Test mode keeps gifts in memory and in the OS temp directory (see
 * lib/giftStore.ts). Neither follows a serverless instance that has been
 * recycled, so a link created ten minutes ago can arrive at a process that
 * has never heard of it. The details form keeps a copy of the gift in the
 * creator's own browser for exactly this case: /g/<slug> serves a small
 * recovery page, that page posts the copy here, and the gift is written back
 * into the store so the ordinary route can render it.
 *
 * Doing it this way — rather than rendering the story from localStorage in
 * the browser — means there is still only one code path that builds a story
 * page, and the PIN is still checked on the server before any of it is sent.
 *
 * Only active in test mode. In the real flow the database is the store and
 * there is nothing to recover.
 */

import { NextRequest, NextResponse } from "next/server";
import { hashPin, newSalt, newUnlockToken, validatePin } from "@/lib/giftPin";
import { loadTestGift, saveTestGift, type TestGift } from "@/lib/giftStore";
import { parseMilestones } from "@/lib/milestones";
import { TEST_MODE } from "@/lib/testMode";

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const orNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export async function POST(req: NextRequest) {
  if (!TEST_MODE) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send the gift as JSON." }, { status: 400 });
  }

  const slug = str(body?.slug);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(slug)) {
    return NextResponse.json({ error: "That isn't a gift link." }, { status: 400 });
  }
  if (!str(body?.message).trim()) {
    return NextResponse.json({ error: "That copy of the gift has no message in it." }, { status: 400 });
  }

  // Already there (another request restored it, or the instance was warm
  // after all) — say so rather than overwriting a good record.
  const existing = await loadTestGift(slug);
  if (existing) return NextResponse.json({ ok: true, alreadyThere: true });

  // Rebuild the lock from the PIN in the copy. A fresh salt and token are
  // generated, so an old unlock cookie stops working and the recipient is
  // asked again — the safe direction for a gate to fail in.
  let pinFields: Pick<
    TestGift,
    "pinHash" | "pinSalt" | "pinType" | "pinHint" | "pinLength" | "unlockToken"
  > = {
    pinHash: null,
    pinSalt: null,
    pinType: null,
    pinHint: null,
    pinLength: null,
    unlockToken: null,
  };

  const pinRaw = str(body?.pin).trim();
  if (pinRaw) {
    const checked = validatePin(pinRaw);
    if (checked.ok) {
      const pinSalt = newSalt();
      pinFields = {
        pinSalt,
        pinHash: hashPin(checked.value, pinSalt),
        pinLength: checked.value.length,
        pinType: orNull(body?.pinType) || "custom",
        pinHint: orNull(body?.pinHint),
        unlockToken: newUnlockToken(),
      };
    }
  }

  const photos = Array.isArray(body?.photos)
    ? body.photos
        .filter((p: any) => typeof p?.url === "string" && p.url)
        .slice(0, 4)
        .map((p: any) => ({
          url: p.url as string,
          caption: orNull(p.caption),
          filterApplied: orNull(p.filterApplied),
        }))
    : [];

  const now = Date.now();
  await saveTestGift({
    slug,
    recipientName: str(body?.recipientName),
    senderName: orNull(body?.senderName),
    occasion: orNull(body?.occasion),
    openingLine: orNull(body?.openingLine),
    message: str(body?.message),
    oneMoreThing: orNull(body?.oneMoreThing),
    letterBody: orNull(body?.letterBody),
    songUrl: orNull(body?.songUrl),
    senderPhotoUrl: orNull(body?.senderPhotoUrl),
    recipientPhotoUrl: orNull(body?.recipientPhotoUrl),
    ...pinFields,
    photos,
    // Re-validated on the way back in: this comes from the browser's own copy
    // of the gift, which is the creator's to edit.
    milestones: parseMilestones(body?.milestones),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TWO_YEARS_MS).toISOString(),
  });

  return NextResponse.json({ ok: true, restored: true });
}
