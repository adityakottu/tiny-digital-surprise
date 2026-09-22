import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";

const TEMPLATE_PATH = path.join(process.cwd(), "lib", "story-template.html");
const SCRIPT_MARKER = '<script src="/story/js/story.js"></script>';

function htmlPage(title: string, body: string, status = 200) {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
     <meta name="viewport" content="width=device-width, initial-scale=1">
     <title>${title}</title>
     <style>
       body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
         background:#1b1330;color:#fffaf7;font-family:-apple-system,BlinkMacSystemFont,sans-serif;
         text-align:center;padding:32px;}
       .card{max-width:420px}
       h1{font-size:1.4rem;margin-bottom:10px}
       p{color:rgba(255,250,247,.7);line-height:1.6}
       a{color:#d7a86e}
     </style></head>
     <body><div class="card">${body}</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const { slug } = params;

  const gift = await prisma.gift.findUnique({
    where: { slug },
    include: { photos: { orderBy: { order: "asc" } }, order: true },
  });

  if (!gift) {
    return htmlPage(
      "Surprise not found",
      `<h1>We couldn't find this surprise 💔</h1><p>Double-check the link — it may have been typed wrong.</p>`,
      404
    );
  }

  // Payment is already re-checked at creation time (a Gift is never created
  // for an unpaid Order), but re-verify here too since this is the page
  // that actually serves the paid content.
  if (gift.order.status !== "paid") {
    return htmlPage(
      "Payment not confirmed",
      `<h1>This link isn't active yet</h1><p>The payment for this gift hasn't been confirmed.</p>`,
      403
    );
  }

  if (gift.expiresAt.getTime() < Date.now()) {
    return htmlPage(
      "This surprise has expired",
      `<h1>This surprise link has expired 🕊️</h1>
       <p>Gift links stay live for 2 years from when they're created.
       If this was meant for you, ask whoever sent it to create a new one.</p>`,
      410
    );
  }

  let template: string;
  try {
    template = await readFile(TEMPLATE_PATH, "utf-8");
  } catch {
    return htmlPage("Something went wrong", `<h1>We hit a snag loading this surprise.</h1><p>Please try again shortly.</p>`, 500);
  }

  const override = {
    identity: {
      recipientName: gift.recipientName || "",
      senderName: gift.senderName || "",
      openingLine: gift.openingLine || undefined,
    },
    finalMessage: {
      personal: gift.message || undefined,
      oneMoreThing: gift.oneMoreThing || undefined,
    },
    songUrl: gift.songUrl || undefined,
    memoryPhotos: gift.photos.length
      ? buildMemoryPhotos(gift.photos.map((p) => ({ src: p.url, caption: p.caption || undefined })))
      : undefined,
  };

  const overrideScript = `<script>window.GIFT_OVERRIDE = ${JSON.stringify(override)};<\/script>\n`;
  const html = template.includes(SCRIPT_MARKER)
    ? template.replace(SCRIPT_MARKER, overrideScript + SCRIPT_MARKER)
    : template; // template got edited and lost the marker — fail open with the default demo rather than 500

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

// Re-applies the same choreography (timing/position/rotation/depth) the
// default four memory photos use, just with the gift's own photo URLs —
// keeps the scene layout intact whether 1 or 4 photos were uploaded.
function buildMemoryPhotos(photos: { src: string; caption?: string }[]) {
  const slots = [
    { id: "m1", at: 0.3, x: "-34%", y: "-8%", rotate: -8, depth: "behind", defaultCaption: "our first photo" },
    { id: "m2", at: 0.46, x: "30%", y: "-14%", rotate: 6, depth: "front", defaultCaption: "that trip" },
    { id: "m3", at: 0.64, x: "-28%", y: "6%", rotate: 5, depth: "front", defaultCaption: "just us" },
    { id: "m4", at: 0.8, x: "26%", y: "4%", rotate: -6, depth: "behind", defaultCaption: "forever kind of day" },
  ];
  return slots.map((slot, i) => {
    const photo = photos[i % photos.length]; // cycle if fewer than 4 uploaded
    const { defaultCaption, ...rest } = slot;
    return { ...rest, src: photo.src, caption: photo.caption || defaultCaption };
  });
}
