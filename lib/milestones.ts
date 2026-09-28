/**
 * milestones.ts — the timeline chapter's content, shared by the builder and
 * the gift API.
 *
 * A sender can keep the built-in six, edit their wording, write their own
 * from scratch, and attach a photo to any of them. Whatever they end up with
 * is stored as JSON on the gift and handed to the story as
 * `timelineMilestones`; a gift with none falls back to the story's own
 * defaults, which is what every gift made before this feature existed does.
 *
 * DEFAULT_MILESTONES is deliberately a copy of the list in
 * public/story/js/story.js rather than an import: that file is a browser
 * script served as-is to the story page, not a module this server can read.
 * If you change one, change both — the builder prefills from here and the
 * story falls back to there, so a drift shows up as a gift that looks
 * different before and after it is saved.
 */

export interface Milestone {
  id: string;
  icon: string;
  title: string;
  text: string;
  /** Data URL or hosted URL; absent when the sender attached no photo. */
  photo?: string | null;
}

export const MAX_MILESTONES = 10;
export const MAX_TITLE = 60;
export const MAX_TEXT = 240;
export const MAX_ICON = 4;

export const DEFAULT_MILESTONES: Milestone[] = [
  { id: "meet", icon: "✦", title: "First Meeting", text: "The day our paths crossed, without either of us planning it." },
  { id: "memory", icon: "❀", title: "First Memory", text: "A moment neither of us has forgotten since." },
  { id: "engage", icon: "♡", title: "Engagement", text: "The promise that made it official." },
  { id: "marriage", icon: "⚭", title: "Marriage", text: "Two stories becoming one." },
  { id: "moments", icon: "✧", title: "Special Moments", text: "All the small, ordinary days that turned out to be the best ones." },
  { id: "future", icon: "➹", title: "Our Future", text: "Still being written — and I wouldn't want to write it with anyone else." },
];

/** A stable id for a milestone the sender added, unique within one gift. */
export function milestoneId(index: number): string {
  return "m" + (index + 1);
}

const clip = (v: unknown, max: number): string =>
  (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Turns whatever the form sent into a list safe to store and render.
 *
 * Returns null when the sender did not customise anything, which is the
 * signal for "use the story's built-in six" — distinct from an empty list,
 * which would mean "no timeline at all" and is not offered.
 *
 * Every field is clipped and the list is capped: this text is written by one
 * person and read by another in their browser, and the story renders it with
 * textContent, so the job here is size rather than escaping.
 */
export function parseMilestones(raw: unknown): Milestone[] | null {
  let list: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      list = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list)) return null;

  const out: Milestone[] = [];
  list.slice(0, MAX_MILESTONES).forEach((item: any, i) => {
    const title = clip(item?.title, MAX_TITLE);
    const text = clip(item?.text, MAX_TEXT);
    // A row with neither a title nor a note is a row the sender left blank.
    if (!title && !text) return;
    const photo = typeof item?.photo === "string" && item.photo ? item.photo : null;
    out.push({
      id: clip(item?.id, 24).replace(/[^a-zA-Z0-9_-]/g, "") || milestoneId(i),
      icon: clip(item?.icon, MAX_ICON) || "✦",
      title,
      text,
      photo,
    });
  });

  return out.length ? out : null;
}

/** True when the list is the built-in six, untouched — nothing worth storing. */
export function isDefaultList(list: Milestone[] | null): boolean {
  if (!list || list.length !== DEFAULT_MILESTONES.length) return false;
  return list.every((m, i) => {
    const d = DEFAULT_MILESTONES[i];
    return !m.photo && m.title === d.title && m.text === d.text && m.icon === d.icon;
  });
}
