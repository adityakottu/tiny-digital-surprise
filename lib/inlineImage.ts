/**
 * inlineImage.ts — what stands in for Google Drive in test mode.
 *
 * In the real flow every upload goes to a Drive folder and the story gets a
 * URL back. Test mode has no Drive credentials, so the bytes have to travel
 * with the gift instead, as a data URL.
 *
 * That only works if they are small. The gift is stored as one JSON file and
 * the whole story page is one HTML response, so full-size phone photos (4-8MB
 * each, and base64 adds a third on top) would make both unusable. Everything
 * is therefore re-encoded to WebP at a size the story actually displays at:
 *
 *  - A portrait for a hologram face is sampled into a texture that is never
 *    shown larger than a few hundred pixels, so 384px is already generous.
 *  - A memory photo sits in a tilted frame at roughly a third of the screen,
 *    so 900px covers a high-DPI phone with room to spare.
 *
 * Uses `sharp`, which the cartoon filter already depends on — nothing new is
 * installed for this. If sharp cannot read the upload, the caller is told and
 * the gift is created without that one image rather than failing outright.
 */

import sharp from "sharp";

export type InlineKind = "portrait" | "memory";

const SETTINGS: Record<InlineKind, { width: number; quality: number }> = {
  portrait: { width: 384, quality: 80 },
  // Kept modest on purpose: when fewer than four photos are uploaded the
  // story cycles the ones it has through all four memory slots, so a single
  // photo's bytes appear four times in the page.
  memory: { width: 800, quality: 68 },
};

/**
 * Re-encodes an uploaded image small enough to embed, and returns it as a
 * data URL. Returns null when the file cannot be used at all.
 */
export async function inlineImage(buffer: Buffer, kind: InlineKind): Promise<string | null> {
  const { width, quality } = SETTINGS[kind];
  try {
    const out = await sharp(buffer)
      .rotate() // honour EXIF orientation, or half the phone photos arrive sideways
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    return `data:image/webp;base64,${out.toString("base64")}`;
  } catch (err) {
    // No raw-bytes fallback on purpose. sharp reads every format a browser
    // can display, so a failure here means the upload is not really an image
    // (a renamed file, a truncated download) — inlining it anyway would put a
    // broken picture in the story instead of telling the sender.
    console.warn("[inlineImage] sharp could not read the upload:", err);
    return null;
  }
}

/**
 * Audio cannot be shrunk the way an image can — re-encoding needs ffmpeg,
 * which is not available here. A song is inlined only if it is already small
 * enough to sit inside the page without wrecking it; otherwise test mode
 * quietly leaves the story on its default track and says so in the response.
 */
export const SONG_INLINE_LIMIT = 3 * 1024 * 1024;

export function inlineAudio(buffer: Buffer, mimeType: string): string | null {
  if (buffer.length > SONG_INLINE_LIMIT) return null;
  return `data:${mimeType || "audio/mpeg"};base64,${buffer.toString("base64")}`;
}
