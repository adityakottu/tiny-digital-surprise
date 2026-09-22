/**
 * Cartoon filter — turns an uploaded portrait into a warm, flat-color,
 * ink-outlined "cartoon" render before it goes into the surprise.
 *
 * This is intentionally NOT a call to a hosted AI image API. Every real
 * generative-AI image service (Replicate, Stability, OpenAI images, even
 * "free tier" ones) is metered and eventually asks for a card — there's no
 * such thing as an unlimited, truly-free hosted image-generation API. So
 * instead this runs a real image-processing "cartoonizer" **locally, on
 * our own server, with the `sharp` library** — the same well-known
 * technique real cartoon-filter apps use under the hood:
 *
 *   1. Smooth the photo (blur) to erase photographic skin/fabric texture,
 *      then lift saturation & brightness for a bright, flat "cel-shaded"
 *      look.
 *   2. Posterize — collapse each color channel down to a handful of flat
 *      levels. This is what actually reads as "cartoon" to the eye: flat
 *      color regions instead of smooth photographic gradients.
 *   3. Edge-detect the *original* photo and multiply-blend the resulting
 *      ink outlines back on top, so faces/features get a drawn "line art"
 *      edge the way a cartoon does.
 *
 * Zero external calls, zero API keys, zero signup, zero cost, no rate
 * limits, works offline — it's just pixel math. It never blocks gift
 * creation: any failure here (a corrupt upload, an unsupported format)
 * falls back to leaving the photo as-is with method: "sample", which the
 * surprise then dresses up with a pure-CSS stylized look instead (see
 * public/story/css/style.css → .photo-filter-sample).
 */

import sharp from "sharp";

export type CartoonifyMethod = "cartoon" | "sample";

export interface CartoonifyResult {
  buffer: Buffer;
  mimeType: string;
  method: CartoonifyMethod;
}

const POSTER_LEVELS = 6; // fewer = more "flat cartoon", more = subtler

export async function cartoonifyImage(
  buffer: Buffer,
  _mimeType: string
): Promise<CartoonifyResult> {
  try {
    // Auto-orient by EXIF first so every step below agrees on "up".
    const oriented = await sharp(buffer).rotate().toBuffer();

    // 1. Soft, saturated, flat-lit base. `.median()` first knocks out real
    // camera sensor noise (which `.blur()` alone tends to just smear
    // instead of remove) before the posterize step below, so flat regions
    // (skin, sky, walls) come out clean instead of speckled.
    const smoothed = await sharp(oriented)
      .median(5)
      .blur(2.2)
      .modulate({ saturation: 1.55, brightness: 1.05 })
      .gamma(1.08)
      .toBuffer();

    const { data, info } = await sharp(smoothed)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 2. Posterize (flatten each color channel to a handful of levels).
    const step = 255 / (POSTER_LEVELS - 1);
    for (let i = 0; i < data.length; i += info.channels) {
      for (let c = 0; c < 3; c++) {
        data[i + c] = Math.min(255, Math.round(Math.round(data[i + c] / step) * step));
      }
    }
    const posterized = sharp(data, {
      raw: { width: info.width, height: info.height, channels: info.channels as 4 },
    });

    // 3. Ink outlines from the original, multiply-blended on top.
    const edges = await sharp(oriented)
      .resize(info.width, info.height)
      .median(3)
      .greyscale()
      .convolve({ width: 3, height: 3, kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] })
      .normalise()
      .threshold(55)
      .negate() // edges -> dark lines, flat areas -> near-white
      .toBuffer();

    const result = await posterized
      .composite([{ input: edges, blend: "multiply" }])
      .jpeg({ quality: 88 })
      .toBuffer();

    return { buffer: result, mimeType: "image/jpeg", method: "cartoon" };
  } catch (err) {
    console.error("Cartoon filter failed, falling back to the sample filter:", err);
    return { buffer, mimeType: _mimeType, method: "sample" };
  }
}
