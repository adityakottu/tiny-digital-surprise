import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadToDrive, deleteFromDrive } from "@/lib/googleDrive";
import { hashPin, newSalt, newUnlockToken, validatePin, type GiftPinType } from "@/lib/giftPin";
import { cartoonifyImage } from "@/lib/cartoonify";
import { TEST_MODE } from "@/lib/testMode";
import { saveTestGift, type TestGift } from "@/lib/giftStore";
import { inlineAudio, inlineImage } from "@/lib/inlineImage";
import { nanoid } from "nanoid";

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const MAX_PHOTOS = 4; // matches the story experience's photo-memory slots

/** Everything the two paths below both need out of the submitted form. */
function readForm(form: FormData) {
  return {
    orderId: (form.get("orderId") as string) || "",
    recipientName: (form.get("recipientName") as string) || "",
    senderName: (form.get("senderName") as string) || "",
    occasion: (form.get("occasion") as string) || "",
    openingLine: (form.get("openingLine") as string) || "",
    message: (form.get("message") as string) || "",
    oneMoreThing: (form.get("oneMoreThing") as string) || "",
    song: form.get("song") as File | null,
    photos: form.getAll("photos") as File[],
    senderPhoto: form.get("senderPhoto") as File | null,
    recipientPhoto: form.get("recipientPhoto") as File | null,
    pinRaw: ((form.get("pin") as string) || "").trim(),
    pinTypeRaw: ((form.get("pinType") as string) || "custom").trim(),
    pinHintRaw: ((form.get("pinHint") as string) || "").trim(),
    captions: form.getAll("captions") as string[],
    // "Apply cartoon filter" toggle from the builder — runs each photo
    // through a real, free, local image-processing cartoonizer (see
    // lib/cartoonify.ts); falls back to a CSS-only "sample filter" if that
    // ever fails.
    cartoonize: form.get("cartoonize") === "true",
  };
}

/** Hashes the PIN, or reports why it cannot be used. Shared by both paths. */
function buildPinFields(pinRaw: string, pinTypeRaw: string, pinHintRaw: string) {
  const empty = {
    pinHash: null as string | null,
    pinSalt: null as string | null,
    pinType: null as string | null,
    pinHint: null as string | null,
    pinLength: null as number | null,
    unlockToken: null as string | null,
    normalised: "",
  };
  if (!pinRaw) return { ok: true as const, fields: empty };

  const checked = validatePin(pinRaw);
  if (!checked.ok) return { ok: false as const, error: checked.error };

  const pinSalt = newSalt();
  return {
    ok: true as const,
    fields: {
      pinSalt,
      pinHash: hashPin(checked.value, pinSalt),
      pinLength: checked.value.length,
      pinType: (["birthday", "anniversary", "custom"] as GiftPinType[]).includes(
        pinTypeRaw as GiftPinType
      )
        ? pinTypeRaw
        : "custom",
      pinHint: pinHintRaw || null,
      unlockToken: newUnlockToken(),
      normalised: checked.value,
    },
  };
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  return TEST_MODE ? createTestGift(form) : createPaidGift(form);
}

/* ------------------------------------------------------------------ *
 * Test mode — no payment, no Drive, no database.
 * See lib/testMode.ts for what is switched off and why.
 * ------------------------------------------------------------------ */

async function createTestGift(form: FormData) {
  const f = readForm(form);

  if (!f.message.trim()) {
    return NextResponse.json({ error: "A personal message is required." }, { status: 400 });
  }
  if (f.photos.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `Up to ${MAX_PHOTOS} photos only.` }, { status: 400 });
  }

  const pin = buildPinFields(f.pinRaw, f.pinTypeRaw, f.pinHintRaw);
  if (!pin.ok) return NextResponse.json({ error: pin.error }, { status: 400 });
  const { normalised, ...pinFields } = pin.fields;

  // Things that could not be carried inside the gift, reported back so the
  // test run is not left wondering why something is missing.
  const notes: string[] = [];

  const photos: TestGift["photos"] = [];
  for (let i = 0; i < f.photos.length; i++) {
    const file = f.photos[i];
    if (!file || file.size === 0) continue;

    let buffer: Buffer = Buffer.from(await file.arrayBuffer());
    let mimeType = file.type || "image/jpeg";
    let filterApplied: string | null = null;

    // The cartoon filter is pure local pixel maths, so it runs in test mode
    // exactly as it does in production — it is part of what needs testing.
    if (f.cartoonize) {
      try {
        const cartoon = await cartoonifyImage(buffer, mimeType);
        buffer = cartoon.buffer;
        mimeType = cartoon.mimeType;
        filterApplied = cartoon.method;
      } catch {
        filterApplied = "sample";
      }
    }

    const url = await inlineImage(buffer, "memory");
    if (!url) {
      notes.push(`Photo ${i + 1} could not be read, so it was left out.`);
      continue;
    }
    photos.push({ url, caption: f.captions[i] || null, filterApplied });
  }

  const inlinePortrait = async (file: File | null, who: string) => {
    if (!file || file.size === 0) return null;
    if (!file.type.startsWith("image/")) {
      notes.push(`The ${who} photo was not an image, so that face was left plain.`);
      return null;
    }
    const url = await inlineImage(Buffer.from(await file.arrayBuffer()), "portrait");
    if (!url) notes.push(`The ${who} photo could not be read, so that face was left plain.`);
    return url;
  };

  const senderPhotoUrl = await inlinePortrait(f.senderPhoto, "sender");
  const recipientPhotoUrl = await inlinePortrait(f.recipientPhoto, "recipient");

  let songUrl: string | null = null;
  if (f.song && f.song.size > 0) {
    songUrl = inlineAudio(Buffer.from(await f.song.arrayBuffer()), f.song.type);
    if (!songUrl) {
      notes.push(
        "The song was too large to carry inside a test gift (over 3MB), so the story keeps its default track."
      );
    }
  }

  const now = Date.now();
  const gift: TestGift = {
    slug: nanoid(8),
    recipientName: f.recipientName,
    senderName: f.senderName || null,
    occasion: f.occasion || null,
    openingLine: f.openingLine || null,
    message: f.message,
    oneMoreThing: f.oneMoreThing || null,
    songUrl,
    senderPhotoUrl,
    recipientPhotoUrl,
    ...pinFields,
    photos,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TWO_YEARS_MS).toISOString(),
  };

  await saveTestGift(gift);

  return NextResponse.json({
    slug: gift.slug,
    expiresAt: gift.expiresAt,
    testMode: true,
    notes,
    // Handed back so the details form can keep a copy in the creator's own
    // browser. A serverless instance can be recycled between creating a link
    // and opening it, and /tmp does not follow; the copy is what makes the
    // link keep working for the person testing. The PIN goes with it because
    // the restore path has no server to check it against — it is only ever in
    // that one browser's localStorage. See app/g/[slug]/route.ts.
    testGift: {
      slug: gift.slug,
      recipientName: gift.recipientName,
      senderName: gift.senderName,
      openingLine: gift.openingLine,
      message: gift.message,
      oneMoreThing: gift.oneMoreThing,
      songUrl: gift.songUrl,
      senderPhotoUrl: gift.senderPhotoUrl,
      recipientPhotoUrl: gift.recipientPhotoUrl,
      photos: gift.photos,
      pin: normalised || null,
      pinHint: gift.pinHint,
      pinLength: gift.pinLength,
      pinType: gift.pinType,
    },
  });
}

/* ------------------------------------------------------------------ *
 * The real thing — paid order, Drive uploads, database.
 * ------------------------------------------------------------------ */

async function createPaidGift(form: FormData) {
  const uploadedFileIds: string[] = []; // for best-effort cleanup on failure

  try {
    const f = readForm(form);

    if (!f.orderId || !f.message.trim()) {
      return NextResponse.json({ error: "A personal message is required." }, { status: 400 });
    }

    const order = await prisma.order.findUnique({ where: { id: f.orderId } });
    if (!order || order.status !== "paid") {
      return NextResponse.json({ error: "Payment not confirmed for this order." }, { status: 403 });
    }
    // One gift per paid order — guards against a double submit creating
    // two Drive uploads for the same payment.
    const existing = await prisma.gift.findUnique({ where: { orderId: f.orderId } });
    if (existing) {
      return NextResponse.json({ slug: existing.slug });
    }

    if (f.photos.length > MAX_PHOTOS) {
      return NextResponse.json({ error: `Up to ${MAX_PHOTOS} photos only.` }, { status: 400 });
    }

    // Upload sequentially (not Promise.all) so a mid-batch failure doesn't
    // leave a pile of orphaned concurrent uploads to clean up.
    const photoUrls: { url: string; caption: string | null; filterApplied: string | null }[] = [];
    for (let i = 0; i < f.photos.length; i++) {
      const file = f.photos[i];
      if (!file || file.size === 0) continue;
      let buffer: Buffer = Buffer.from(await file.arrayBuffer());
      let mimeType = file.type || "image/jpeg";
      let filterApplied: string | null = null;

      if (f.cartoonize) {
        const cartoon = await cartoonifyImage(buffer, mimeType);
        buffer = cartoon.buffer;
        mimeType = cartoon.mimeType;
        filterApplied = cartoon.method; // "cartoon" or "sample"
      }

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const result = await uploadToDrive(buffer, `gift-photo-${nanoid(8)}.${ext}`, mimeType);
      uploadedFileIds.push(result.fileId);
      photoUrls.push({ url: result.viewUrl, caption: f.captions[i] || null, filterApplied });
    }

    // Portrait photos for the hologram faces. Deliberately not run through
    // the cartoon filter: the hologram shader already restyles them into
    // light, and stacking two stylisations makes a face unrecognisable —
    // which defeats the entire point of asking for a photo of the person.
    const uploadPortrait = async (file: File | null, who: string) => {
      if (!file || file.size === 0) return null;
      if (!file.type.startsWith("image/")) {
        throw new Error(`The ${who} photo must be an image.`);
      }
      if (file.size > 8 * 1024 * 1024) {
        throw new Error(`The ${who} photo must be under 8MB.`);
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const result = await uploadToDrive(buffer, `gift-face-${who}-${nanoid(8)}.${ext}`, file.type);
      uploadedFileIds.push(result.fileId);
      return result.viewUrl;
    };

    const senderPhotoUrl = await uploadPortrait(f.senderPhoto, "sender");
    const recipientPhotoUrl = await uploadPortrait(f.recipientPhoto, "recipient");

    // Optional PIN lock. Only the hash and a per-gift salt are stored; the
    // PIN itself is never written down anywhere.
    const pin = buildPinFields(f.pinRaw, f.pinTypeRaw, f.pinHintRaw);
    if (!pin.ok) return NextResponse.json({ error: pin.error }, { status: 400 });
    const { normalised: _unused, ...pinFields } = pin.fields;

    let songUrl: string | null = null;
    if (f.song && f.song.size > 0) {
      const buffer = Buffer.from(await f.song.arrayBuffer());
      const ext = (f.song.name.split(".").pop() || "mp3").toLowerCase();
      const result = await uploadToDrive(buffer, `gift-song-${nanoid(8)}.${ext}`, f.song.type || "audio/mpeg");
      uploadedFileIds.push(result.fileId);
      songUrl = result.viewUrl;
    }

    const slug = nanoid(8);
    const expiresAt = new Date(Date.now() + TWO_YEARS_MS);

    const gift = await prisma.gift.create({
      data: {
        slug,
        orderId: f.orderId,
        recipientName: f.recipientName,
        senderName: f.senderName || null,
        occasion: f.occasion || null,
        openingLine: f.openingLine || null,
        message: f.message,
        oneMoreThing: f.oneMoreThing || null,
        songUrl,
        senderPhotoUrl,
        recipientPhotoUrl,
        ...pinFields,
        expiresAt,
        photos: {
          create: photoUrls.map((p, i) => ({
            url: p.url,
            caption: p.caption,
            order: i,
            filterApplied: p.filterApplied,
          })),
        },
      },
    });

    return NextResponse.json({ slug: gift.slug, expiresAt: gift.expiresAt });
  } catch (err) {
    console.error(err);
    // Best-effort cleanup of anything already uploaded this request.
    await Promise.all(uploadedFileIds.map(deleteFromDrive));
    const message = err instanceof Error ? err.message : "Could not create the gift.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
