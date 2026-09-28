/**
 * /api/gifts/preview — renders a story from a payload, storing nothing.
 *
 * It exists for two jobs that turn out to be the same job:
 *
 *  1. The builder's preview. A sender should be able to see what they are
 *     sending before they send it, with their own words and photos in place.
 *
 *  2. Reopening a test gift the server has lost. Test mode keeps gifts on the
 *     instance that made them (lib/giftStore.ts), and a serverless request
 *     can land anywhere, so a link created a minute ago can reach a process
 *     that has never heard of it. Reloading does not help — the reload can
 *     land somewhere else again. Sending the gift WITH the request does,
 *     because there is no lookup to miss: the browser posts its own copy and
 *     gets the rendered page straight back.
 *
 * Nothing here is written down and Prisma is never touched. Uploaded images
 * are inlined into the returned HTML and thrown away with the response.
 *
 * On the PIN: a preview rendered from a payload skips the lock, and that is
 * correct. The payload comes from the sender's own browser — they wrote the
 * PIN. A recipient has no copy to post, so this is not a way around the gate
 * on someone else's gift.
 */

import { NextRequest } from "next/server";
import { parseMilestones, type Milestone } from "@/lib/milestones";
import { buildOverride, renderStory, type StoryContent } from "@/lib/storyPage";
import { inlineAudio, inlineImage } from "@/lib/inlineImage";

// Re-encoding a handful of photos takes longer than the default allowance.
export const maxDuration = 60;

const MAX_PHOTOS = 4;
const MAX_MILESTONE_PHOTOS = 10;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function fail(message: string, status: number) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preview</title></head>
     <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#120b26;
       color:#f4ecf4;font-family:system-ui,sans-serif;text-align:center;padding:32px">
       <p>${message}</p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );
}

/** The builder posts the live form; the recovery page posts a stored gift. */
async function contentFromForm(form: FormData): Promise<StoryContent> {
  const photos: StoryContent["photos"] = [];
  const files = (form.getAll("photos") as File[]).slice(0, MAX_PHOTOS);
  for (const file of files) {
    if (!file || file.size === 0 || !file.type.startsWith("image/")) continue;
    const url = await inlineImage(Buffer.from(await file.arrayBuffer()), "memory");
    if (url) photos.push({ url, caption: null, filterApplied: null });
  }

  const portrait = async (name: string) => {
    const file = form.get(name) as File | null;
    if (!file || file.size === 0 || !file.type.startsWith("image/")) return null;
    return inlineImage(Buffer.from(await file.arrayBuffer()), "portrait");
  };

  const milestones: Milestone[] | null = parseMilestones(str(form.get("milestones")));
  if (milestones) {
    for (let i = 0; i < Math.min(milestones.length, MAX_MILESTONE_PHOTOS); i++) {
      const file = form.get(`milestonePhoto-${i}`) as File | null;
      if (!file || file.size === 0 || !file.type.startsWith("image/")) continue;
      const url = await inlineImage(Buffer.from(await file.arrayBuffer()), "memory");
      if (url) milestones[i].photo = url;
    }
  }

  const song = form.get("song") as File | null;
  let songUrl: string | null = null;
  if (song && song.size > 0) {
    songUrl = inlineAudio(Buffer.from(await song.arrayBuffer()), song.type);
  }

  return {
    recipientName: str(form.get("recipientName")),
    senderName: str(form.get("senderName")),
    openingLine: str(form.get("openingLine")),
    message: str(form.get("message")),
    oneMoreThing: str(form.get("oneMoreThing")),
    letterBody: str(form.get("letterBody")),
    senderPhotoUrl: await portrait("senderPhoto"),
    recipientPhotoUrl: await portrait("recipientPhoto"),
    milestones,
    songUrl,
    photos,
  };
}

/** A gift already assembled, as the browser's own copy holds it. */
function contentFromJson(body: any): StoryContent {
  return {
    recipientName: str(body?.recipientName),
    senderName: str(body?.senderName),
    openingLine: str(body?.openingLine),
    message: str(body?.message),
    oneMoreThing: str(body?.oneMoreThing),
    letterBody: str(body?.letterBody),
    senderPhotoUrl: str(body?.senderPhotoUrl) || null,
    recipientPhotoUrl: str(body?.recipientPhotoUrl) || null,
    songUrl: str(body?.songUrl) || null,
    milestones: parseMilestones(body?.milestones),
    photos: Array.isArray(body?.photos)
      ? body.photos
          .filter((p: any) => typeof p?.url === "string" && p.url)
          .slice(0, MAX_PHOTOS)
          .map((p: any) => ({
            url: p.url as string,
            caption: typeof p.caption === "string" ? p.caption : null,
            filterApplied: typeof p.filterApplied === "string" ? p.filterApplied : null,
          }))
      : [],
  };
}

export async function POST(req: NextRequest) {
  const type = req.headers.get("content-type") || "";

  let content: StoryContent;
  try {
    if (type.includes("application/json")) {
      content = contentFromJson(await req.json());
    } else {
      content = await contentFromForm(await req.formData());
    }
  } catch (err) {
    console.error("[preview] could not read the payload:", err);
    return fail("We couldn&rsquo;t read that. Try again.", 400);
  }

  // A preview with nothing in it would just be the sample story, which is
  // misleading — it would look like the sender's words had been lost.
  if (!content.message && !content.recipientName && !(content.photos || []).length) {
    return fail("Add a message first, then preview it.", 400);
  }

  const html = await renderStory(buildOverride(content));
  if (!html) return fail("We hit a snag building the preview.", 500);

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Never cached: it is one person's unsaved draft.
      "cache-control": "private, no-store",
    },
  });
}
