import { readFile } from "fs/promises";
import path from "path";

const TEMPLATE_PATH = path.join(process.cwd(), "lib", "story-template.html");
const SCRIPT_MARKER = '<script src="/story/js/story.js"></script>';

/**
 * Sample content for the public demo.
 *
 * Shaped exactly like the override /g/[slug] builds from a real Gift row, so
 * the demo exercises the same code path a paid gift does — if the story
 * renders here, it renders for a customer. The photos are the sample set in
 * public/story/assets/photos, not anyone's real memories.
 */
const DEMO_OVERRIDE = {
  identity: {
    recipientName: "Priya",
    senderName: "Aditya",
    openingLine: "I made something for you…",
  },
  finalMessage: {
    personal:
      "Thank you for every ordinary day you made extraordinary. Here's to all the ones still coming.",
    oneMoreThing:
      "P.S. — I'd choose you in every single lifetime. 💛",
  },
  memoryPhotos: [
    { id: "m1", src: "/story/assets/photos/memory-01.jpg", at: 0.3, x: "-34%", y: "-8%", rotate: -8, depth: "behind", caption: "our first photo" },
    { id: "m2", src: "/story/assets/photos/memory-02.jpg", at: 0.46, x: "30%", y: "-14%", rotate: 6, depth: "front", caption: "that trip" },
    { id: "m3", src: "/story/assets/photos/memory-03.jpg", at: 0.64, x: "-28%", y: "6%", rotate: 5, depth: "front", caption: "just us" },
    { id: "m4", src: "/story/assets/photos/memory-04.jpg", at: 0.8, x: "26%", y: "4%", rotate: -6, depth: "behind", caption: "forever kind of day" },
  ],
};

export async function GET() {
  let template: string;
  try {
    template = await readFile(TEMPLATE_PATH, "utf-8");
  } catch {
    return new Response(
      `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
       <meta name="viewport" content="width=device-width, initial-scale=1">
       <title>Demo unavailable</title></head>
       <body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1b1330;color:#fffaf7;font-family:-apple-system,BlinkMacSystemFont,sans-serif;text-align:center;padding:32px">
       <div><h1 style="font-size:1.4rem;margin-bottom:10px">The demo is having a moment 💔</h1>
       <p style="color:rgba(255,250,247,.7);line-height:1.6">Please try again shortly.</p></div>
       </body></html>`,
      { status: 500, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  const overrideScript = `<script>window.GIFT_OVERRIDE = ${JSON.stringify(
    DEMO_OVERRIDE
  )};<\/script>\n`;
  const html = template.includes(SCRIPT_MARKER)
    ? template.replace(SCRIPT_MARKER, overrideScript + SCRIPT_MARKER)
    : template; // marker lost from the template — fall back to its built-in sample

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Static sample content: let the CDN serve it rather than re-rendering
      // per visitor, since this is the page traffic lands on from ads.
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
