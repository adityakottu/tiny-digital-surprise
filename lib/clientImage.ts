/**
 * clientImage.ts — shrink uploads in the browser, before they are sent.
 *
 * Why this has to happen on the client: a Vercel serverless function accepts
 * a request body of at most 4.5MB, and the platform rejects anything larger
 * before the route ever runs. A photo straight off a phone is 3-5MB, so two
 * of them are already over the line and the gift cannot be created at all.
 * No amount of server-side care fixes that — the bytes have to be smaller
 * when they leave the browser.
 *
 * It also makes the request fast enough to finish inside the function's time
 * limit, and cuts the work the server has to redo.
 *
 * Ceilings are set by what the story actually displays:
 *
 *  - A portrait becomes a texture on a hologram head, never shown larger than
 *    a few hundred pixels.
 *  - A memory photo sits in a tilted frame at roughly a third of the screen;
 *    1280px covers a high-DPI phone with room to spare, and 1600px is kept
 *    for real gifts, whose photos are stored full-size on Drive.
 *
 * Anything that cannot be decoded (a HEIC the browser will not open, a
 * renamed file) is passed through untouched — the server reports it properly
 * rather than this failing silently here.
 */

export type ShrinkKind = "portrait" | "memory";

interface Ceiling {
  maxEdge: number;
  quality: number;
}

const CEILINGS: Record<ShrinkKind, { test: Ceiling; real: Ceiling }> = {
  portrait: { test: { maxEdge: 512, quality: 0.82 }, real: { maxEdge: 768, quality: 0.86 } },
  memory: { test: { maxEdge: 1280, quality: 0.8 }, real: { maxEdge: 1600, quality: 0.85 } },
};

/** Below this a photo is already small enough that re-encoding only loses quality. */
const LEAVE_ALONE_BELOW = 220 * 1024;

function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    // Honours EXIF orientation, so portrait phone photos do not come out sideways.
    return createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("could not decode"));
    };
    img.src = url;
  });
}

/**
 * Returns a smaller version of the file, or the original if it is already
 * small enough or cannot be decoded.
 */
export async function shrinkImage(
  file: File,
  kind: ShrinkKind,
  testMode: boolean,
  maxEdgeOverride?: number
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const { quality } = CEILINGS[kind][testMode ? "test" : "real"];
  const maxEdge = maxEdgeOverride || CEILINGS[kind][testMode ? "test" : "real"].maxEdge;

  try {
    const bitmap = await loadBitmap(file);
    const w = "width" in bitmap ? bitmap.width : 0;
    const h = "height" in bitmap ? bitmap.height : 0;
    if (!w || !h) return file;

    const scale = Math.min(1, maxEdge / Math.max(w, h));
    // Already small in both dimensions and in bytes — re-encoding would only
    // throw quality away for nothing.
    if (scale === 1 && file.size <= LEAVE_ALONE_BELOW) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    // If the re-encode somehow came out larger, keep the original.
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Formats a byte count the way a person would say it. */
export function readableSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + "MB";
  return Math.max(1, Math.round(bytes / 1024)) + "KB";
}

/**
 * What the platform will accept in one request. Vercel's hard limit is 4.5MB;
 * this leaves room for the form's text fields and multipart overhead.
 */
export const UPLOAD_BUDGET = 3.8 * 1024 * 1024;

/**
 * How wide to allow each photo, given how many are being sent.
 *
 * A gift can now carry four memory photos, two portraits and a photo on each
 * of ten milestones. At the single-photo ceiling that is well past the 4.5MB
 * the platform will accept, and the sender only found out at the end, when
 * the form refused the whole submission. Scaling the ceiling down as the
 * count goes up keeps a full gift inside the budget instead, and the photos
 * that lose width are the ones shown smallest anyway.
 */
export function ceilingFor(count: number, kind: ShrinkKind, testMode: boolean): number {
  const base = CEILINGS[kind][testMode ? "test" : "real"].maxEdge;
  if (kind === "portrait") return base;      // two at most, and already small
  if (count <= 4) return base;
  if (count <= 8) return Math.round(base * 0.78);
  return Math.round(base * 0.62);
}
