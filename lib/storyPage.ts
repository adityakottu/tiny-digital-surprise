/**
 * storyPage.ts — turning a gift into the story page.
 *
 * Three routes need this and used to each do their own version of it:
 * /g/[slug] for a real gift, /demo for the sample, and /api/gifts/preview
 * for the builder's preview and for reopening a test gift whose server-side
 * copy has gone. Having one place to build the override means a field added
 * to the builder cannot appear in the gift and be missing from the preview.
 */

import { readFile } from "fs/promises";
import path from "path";
import type { Milestone } from "@/lib/milestones";

const TEMPLATE_PATH = path.join(process.cwd(), "lib", "story-template.html");
const SCRIPT_MARKER = '<script src="/story/js/story.js"></script>';

/** Everything the story can be personalised with. */
export interface StoryContent {
  recipientName?: string | null;
  senderName?: string | null;
  openingLine?: string | null;
  message?: string | null;
  oneMoreThing?: string | null;
  letterBody?: string | null;
  songUrl?: string | null;
  senderPhotoUrl?: string | null;
  recipientPhotoUrl?: string | null;
  milestones?: Milestone[] | null;
  photos?: { url: string; caption?: string | null; filterApplied?: string | null }[];
}

const orUndef = (v: string | null | undefined) => (v ? v : undefined);

/**
 * Re-applies the choreography (timing/position/rotation/depth) the default
 * four memory photos use, just with the gift's own photo URLs — so the scene
 * layout holds whether 1 or 4 photos were uploaded.
 */
function buildMemoryPhotos(photos: { src: string; caption?: string; filter?: string }[]) {
  const slots = [
    { id: "m1", at: 0.3, x: "-34%", y: "-8%", rotate: -8, depth: "behind", defaultCaption: "our first photo" },
    { id: "m2", at: 0.46, x: "30%", y: "-14%", rotate: 6, depth: "front", defaultCaption: "that trip" },
    { id: "m3", at: 0.64, x: "-28%", y: "6%", rotate: 5, depth: "front", defaultCaption: "just us" },
    { id: "m4", at: 0.8, x: "26%", y: "4%", rotate: -6, depth: "behind", defaultCaption: "forever kind of day" },
  ];
  return slots.map((slot, i) => {
    const photo = photos[i % photos.length]; // cycle if fewer than 4 uploaded
    const { defaultCaption, ...rest } = slot;
    return { ...rest, src: photo.src, caption: photo.caption || defaultCaption, filter: photo.filter };
  });
}

/** The object story.js merges over its defaults. */
export function buildOverride(gift: StoryContent) {
  const photos = gift.photos || [];
  return {
    identity: {
      recipientName: gift.recipientName || "",
      senderName: gift.senderName || "",
      openingLine: orUndef(gift.openingLine),
      // Kept for the closing scene's framed portraits. They are no longer
      // projected onto the hologram couple, who have drawn faces.
      senderPhoto: orUndef(gift.senderPhotoUrl),
      recipientPhoto: orUndef(gift.recipientPhotoUrl),
    },
    finalMessage: {
      personal: orUndef(gift.message),
      oneMoreThing: orUndef(gift.oneMoreThing),
    },
    songUrl: orUndef(gift.songUrl),
    // The letter's own words. Left out when the sender did not write one, so
    // story.js falls back to the closing message as it always has.
    chapters: gift.letterBody ? { letter: { body: gift.letterBody } } : undefined,
    // Left undefined when the sender kept the defaults, so story.js falls
    // through to its own built-in six rather than being handed a copy.
    timelineMilestones: gift.milestones && gift.milestones.length ? gift.milestones : undefined,
    memoryPhotos: photos.length
      ? buildMemoryPhotos(
          photos.map((p) => ({
            src: p.url,
            caption: p.caption || undefined,
            filter: p.filterApplied || undefined, // "cartoon" | "sample" | undefined
          }))
        )
      : undefined,
  };
}

/**
 * The story template with the override injected above story.js.
 *
 * Returns null when the template cannot be read, so each caller can decide
 * what to show instead rather than this throwing into a route handler.
 */
export async function renderStory(override: unknown): Promise<string | null> {
  let template: string;
  try {
    template = await readFile(TEMPLATE_PATH, "utf-8");
  } catch {
    return null;
  }
  // The closing tag is split so it cannot end this script element early if a
  // gift's own text happens to contain one.
  const script = `<script>window.GIFT_OVERRIDE = ${JSON.stringify(override)};<\/script>\n`;
  return template.includes(SCRIPT_MARKER)
    ? template.replace(SCRIPT_MARKER, script + SCRIPT_MARKER)
    : template; // marker lost from the template — fail open with the sample
}
