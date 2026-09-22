import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadToDrive, deleteFromDrive } from "@/lib/googleDrive";
import { cartoonifyImage } from "@/lib/cartoonify";
import { nanoid } from "nanoid";

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const MAX_PHOTOS = 4; // matches the story experience's photo-memory slots

export async function POST(req: NextRequest) {
  const uploadedFileIds: string[] = []; // for best-effort cleanup on failure

  try {
    const form = await req.formData();

    const orderId = form.get("orderId") as string;
    const recipientName = (form.get("recipientName") as string) || "";
    const senderName = (form.get("senderName") as string) || "";
    const occasion = (form.get("occasion") as string) || "";
    const openingLine = (form.get("openingLine") as string) || "";
    const message = (form.get("message") as string) || "";
    const oneMoreThing = (form.get("oneMoreThing") as string) || "";
    const song = form.get("song") as File | null;
    const photos = form.getAll("photos") as File[];
    const captions = form.getAll("captions") as string[];
    // "Apply cartoon filter" toggle from the builder — runs each photo
    // through a real, free, local image-processing cartoonizer (see
    // lib/cartoonify.ts); falls back to a CSS-only "sample filter" if that
    // ever fails.
    const cartoonize = form.get("cartoonize") === "true";

    if (!orderId || !message.trim()) {
      return NextResponse.json({ error: "A personal message is required." }, { status: 400 });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "paid") {
      return NextResponse.json({ error: "Payment not confirmed for this order." }, { status: 403 });
    }
    // One gift per paid order — guards against a double submit creating
    // two Drive uploads for the same payment.
    const existing = await prisma.gift.findUnique({ where: { orderId } });
    if (existing) {
      return NextResponse.json({ slug: existing.slug });
    }

    if (photos.length > MAX_PHOTOS) {
      return NextResponse.json({ error: `Up to ${MAX_PHOTOS} photos only.` }, { status: 400 });
    }

    // Upload sequentially (not Promise.all) so a mid-batch failure doesn't
    // leave a pile of orphaned concurrent uploads to clean up.
    const photoUrls: { url: string; caption: string | null; filterApplied: string | null }[] = [];
    for (let i = 0; i < photos.length; i++) {
      const file = photos[i];
      if (!file || file.size === 0) continue;
      let buffer: Buffer = Buffer.from(await file.arrayBuffer());
      let mimeType = file.type || "image/jpeg";
      let filterApplied: string | null = null;

      if (cartoonize) {
        const cartoon = await cartoonifyImage(buffer, mimeType);
        buffer = cartoon.buffer;
        mimeType = cartoon.mimeType;
        filterApplied = cartoon.method; // "cartoon" or "sample"
      }

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const result = await uploadToDrive(buffer, `gift-photo-${nanoid(8)}.${ext}`, mimeType);
      uploadedFileIds.push(result.fileId);
      photoUrls.push({ url: result.viewUrl, caption: captions[i] || null, filterApplied });
    }

    let songUrl: string | null = null;
    if (song && song.size > 0) {
      const buffer = Buffer.from(await song.arrayBuffer());
      const ext = (song.name.split(".").pop() || "mp3").toLowerCase();
      const result = await uploadToDrive(buffer, `gift-song-${nanoid(8)}.${ext}`, song.type || "audio/mpeg");
      uploadedFileIds.push(result.fileId);
      songUrl = result.viewUrl;
    }

    const slug = nanoid(8);
    const expiresAt = new Date(Date.now() + TWO_YEARS_MS);

    const gift = await prisma.gift.create({
      data: {
        slug,
        orderId,
        recipientName,
        senderName: senderName || null,
        occasion: occasion || null,
        openingLine: openingLine || null,
        message,
        oneMoreThing: oneMoreThing || null,
        songUrl,
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
