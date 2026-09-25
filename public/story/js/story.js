/* ==========================================================================
   story.js — ALL editable content lives here.
   Nothing in this file drives animation directly; animations.js reads these
   objects and decides how/when to move things. To customise your gift,
   edit the values below — you should not need to touch animation code.
   ========================================================================== */

/**
 * identity — who this gift is from/to, and the opening line. Shown on the
 * opening screen and in the footer. Safe to leave blank (falls back to the
 * generic "Hey ❤️" / "Made with love, for you.").
 */
const identity = {
  // Passport-style photos projected onto the hologram couple's faces.
  // Leave null for plain hologram heads. See assets/faces/README.md.
  senderPhoto: null,     // e.g. "assets/faces/him.jpg"
  recipientPhoto: null,  // e.g. "assets/faces/her.jpg"
  recipientName: "",   // e.g. "Priya" -> opening becomes "Hey Priya ❤️"
  senderName: "",      // e.g. "Aditya" -> footer becomes "Made with love, from Aditya."
  openingLine: "I made something special for you…",
};

/**
 * storyScenes — the narrative beats shown during the pinned scroll story.
 * `at` is the scroll progress (0–1) within the main story timeline at which
 * the line should be fully visible. Keep 3–6 short beats; more than that
 * gets crowded on small screens.
 */
const storyScenes = [
  { id: "opening",  at: 0.02, title: "",  text: "Some stories begin unexpectedly…", small: false },
  { id: "somehow",  at: 0.16, title: "",  text: "And somehow…",                     small: true  },
  { id: "found",    at: 0.24, title: "",  text: "We found each other.",             small: false },
  { id: "strangers",at: 0.42, title: "",  text: "From strangers…",                  small: true  },
  { id: "partners", at: 0.58, title: "",  text: "To partners…",                     small: true  },
  { id: "forever",  at: 0.78, title: "",  text: "To forever.",                      small: false },
];

/**
 * memoryPhotos — personal photos flown into the story.
 * Replace `src` with your own files under /assets/photos/ (see README).
 * `at` = scroll progress the photo should be fully in place.
 * `depth` = "front" | "behind" character layer.
 * `caption` is optional (shown Polaroid-style under the photo).
 */
const memoryPhotos = [
  { id: "m1", src: "/story/assets/photos/memory-01.jpg", at: 0.30, x: "-34%", y: "-8%",  rotate: -8,  depth: "behind", caption: "our first photo" },
  { id: "m2", src: "/story/assets/photos/memory-02.jpg", at: 0.46, x: "30%",  y: "-14%", rotate: 6,   depth: "front",  caption: "that trip" },
  { id: "m3", src: "/story/assets/photos/memory-03.jpg", at: 0.64, x: "-28%", y: "6%",   rotate: 5,   depth: "front",  caption: "just us" },
  { id: "m4", src: "/story/assets/photos/memory-04.jpg", at: 0.80, x: "26%",  y: "4%",   rotate: -6,  depth: "behind", caption: "forever kind of day" },
];

/**
 * timelineMilestones — the relationship timeline section.
 * Edit freely; icon accepts any emoji or short glyph.
 */
const timelineMilestones = [
  { id: "meet",     icon: "✦", title: "First Meeting",   text: "The day our paths crossed, without either of us planning it." },
  { id: "memory",   icon: "❀", title: "First Memory",    text: "A moment neither of us has forgotten since." },
  { id: "engage",   icon: "♡", title: "Engagement",      text: "The promise that made it official." },
  { id: "marriage", icon: "⚭", title: "Marriage",        text: "Two stories becoming one." },
  { id: "moments",  icon: "✧", title: "Special Moments", text: "All the small, ordinary days that turned out to be the best ones." },
  { id: "future",   icon: "➹", title: "Our Future",      text: "Still being written — and I wouldn't want to write it with anyone else." },
];

/**
 * finalMessage — the personalised closing note, and the "one more thing"
 * bonus reveal shown when that button is tapped.
 */
const finalMessage = {
  line1: "Some stories are meant to be lived…",
  line2: "Our story is my favourite one. ❤️",
  personal: "Thank you for every ordinary day you made extraordinary. Here's to all the ones still coming.",
  oneMoreThing: "P.S. — I'd choose you in every single lifetime. Every version of me finds every version of you. 💛",
};

/**
 * backgroundScenes — six cinematic backdrops crossfaded across the whole
 * pinned story as the user scrolls. Colours only (no image assets required),
 * so the page stays light. Swap `from/to` for your own palette per scene,
 * or point `image` at a file in /assets/backgrounds/ to use a photo instead.
 */
const backgroundScenes = [
  { id: "pastel",   at: 0.00, from: "#f3e3e8", to: "#e6c9d6", mood: "soft pastel morning" },
  { id: "sunset",   at: 0.18, from: "#f2a26b", to: "#8f3f6b", mood: "sunset outdoors" },
  { id: "night",    at: 0.38, from: "#1b1330", to: "#2a1a3a", mood: "city night" },
  { id: "wedding",  at: 0.56, from: "#ffffff", to: "#d7a86e", mood: "wedding-inspired" },
  { id: "home",     at: 0.74, from: "#5a3a2a", to: "#c98b5e", mood: "warm home" },
  { id: "dreamy",   at: 0.90, from: "#2a1a3a", to: "#8f2f55", mood: "dreamy emotional final" },
];

/**
 * When this page was generated by the builder (index.html), a
 * `window.GIFT_OVERRIDE` object was injected just above this script tag.
 * Merge it over the defaults, key by key — the builder only needs to send
 * the fields it actually collected, everything else keeps its default.
 */
const DEFAULTS = { identity, storyScenes, memoryPhotos, timelineMilestones, finalMessage, backgroundScenes };
const OVERRIDE = (typeof window !== "undefined" && window.GIFT_OVERRIDE) || {};
const STORY = {};
Object.keys(DEFAULTS).forEach((key) => {
  const base = DEFAULTS[key];
  const patch = OVERRIDE[key];
  if (patch == null) { STORY[key] = base; return; }
  // plain objects (identity, finalMessage) -> shallow merge;
  // arrays (storyScenes, memoryPhotos, ...) -> full replace if provided.
  STORY[key] = Array.isArray(base) ? patch : Object.assign({}, base, patch);
});

// Exposed for the other modules (plain globals — no bundler, per spec §1)
window.STORY = STORY;
