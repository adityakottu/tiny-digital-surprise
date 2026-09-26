import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";
import {
  clearFailures,
  defaultHint,
  isLockedOut,
  pinMatches,
  registerFailure,
  tokenMatches,
  unlockCookieName,
  validatePin,
  type GiftPinType,
} from "@/lib/giftPin";

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

/**
 * The lock screen.
 *
 * Deliberately self-contained: it carries none of the story's markup, copy,
 * photos or scripts, because the whole point is that the story has not been
 * sent yet. The only thing it knows about the gift is the hint the sender
 * chose to show.
 */
function lockPage(slug: string, hint: string, length: number, error?: string) {
  const safeHint = escapeHtml(hint);
  const safeError = error ? escapeHtml(error) : "";
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>A gift is waiting</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0b0a1e">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;1,500&family=Manrope:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;
    padding:32px 24px;text-align:center;color:#f4ecf4;
    font-family:"Manrope",system-ui,sans-serif;
    background:
      radial-gradient(90% 60% at 50% 34%,rgba(96,70,160,.28),transparent 66%),
      radial-gradient(70% 50% at 20% 86%,rgba(150,60,110,.18),transparent 64%),
      linear-gradient(180deg,#08091c,#0d0a22 46%,#120b26);}
  .wrap{width:100%;max-width:400px;display:grid;gap:1.25rem;justify-items:center}
  .lock{width:54px;height:54px;display:grid;place-items:center;border-radius:50%;
    background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14)}
  h1{font-family:"Fraunces",Georgia,serif;font-weight:500;
    font-size:clamp(1.5rem,1.2rem+1.6vw,2.1rem);margin:0;line-height:1.25}
  p{margin:0;color:rgba(244,236,244,.66);line-height:1.6;font-size:.98rem}
  .hint{font-size:.9rem;letter-spacing:.02em;color:rgba(244,236,244,.8)}
  form{display:grid;gap:.85rem;width:100%;justify-items:center}
  input{width:100%;padding:.9rem 1rem;border-radius:14px;text-align:center;
    font-size:1.25rem;letter-spacing:.35em;font-family:"Manrope",system-ui,sans-serif;
    color:#fff;background:rgba(255,255,255,.07);
    border:1px solid rgba(255,255,255,.18);outline:none}
  input::placeholder{letter-spacing:.2em;color:rgba(255,255,255,.28)}
  input:focus{border-color:rgba(255,190,215,.6);box-shadow:0 0 0 3px rgba(255,150,190,.16)}
  button{width:100%;padding:.85rem 1rem;border:0;border-radius:999px;cursor:pointer;
    font-weight:700;letter-spacing:.06em;color:#fff;font-size:.98rem;
    background:linear-gradient(180deg,#b5375f,#8f2f55);
    box-shadow:0 10px 28px rgba(143,47,85,.42)}
  button:disabled{opacity:.6;cursor:default}
  .err{min-height:1.2em;font-size:.9rem;color:#ffb3c7}
  .foot{font-size:.8rem;color:rgba(244,236,244,.4)}
</style></head>
<body>
  <main class="wrap">
    <div class="lock" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f4ecf4" stroke-width="1.8">
        <rect x="4" y="10.5" width="16" height="10" rx="2.5"/>
        <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>
      </svg>
    </div>
    <h1>Someone made you something</h1>
    <p>It&rsquo;s locked until you put in the PIN they chose.</p>
    <p class="hint">${safeHint}</p>
    <form id="f" novalidate>
      <input id="pin" name="pin" type="text" inputmode="numeric" autocomplete="off"
             autocapitalize="off" spellcheck="false" enterkeyhint="go"
             maxlength="32" placeholder="${"•".repeat(Math.min(Math.max(length, 4), 12))}"
             aria-describedby="err" aria-label="PIN">
      <button id="go" type="submit">Unlock</button>
      <p class="err" id="err" role="status" aria-live="polite">${safeError}</p>
    </form>
    <p class="foot">Ask whoever sent it if you&rsquo;re stuck.</p>
  </main>
<script>
(function(){
  var f=document.getElementById("f"),i=document.getElementById("pin"),
      b=document.getElementById("go"),e=document.getElementById("err");
  i.focus();
  f.addEventListener("submit",function(ev){
    ev.preventDefault();
    var v=i.value.trim();
    if(!v){e.textContent="Put the PIN in first.";return;}
    b.disabled=true;e.textContent="Checking…";
    fetch(location.pathname,{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({pin:v})})
      .then(function(r){return r.json().then(function(j){return {s:r.status,j:j};});})
      .then(function(res){
        if(res.j && res.j.ok){ e.textContent="Opening…"; location.reload(); return; }
        b.disabled=false;
        e.textContent=(res.j && res.j.error) || "That PIN isn't right.";
        i.select();
      })
      .catch(function(){ b.disabled=false; e.textContent="Something went wrong. Try again."; });
  });
})();
</script>
</body></html>`,
    {
      status: 401,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Never cache a lock screen, or a CDN can serve it to someone who has
        // already unlocked — or worse, cache the story for someone who has not.
        "cache-control": "no-store",
      },
    }
  );
}

function escapeHtml(v: string) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Best-effort client key for throttling: whatever the proxy tells us. */
function clientKey(req: NextRequest, slug: string) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return slug + "|" + ip;
}

/**
 * Verifies a PIN and, on success, hands back the gift's unlock token in an
 * HttpOnly cookie. Rejections are deliberately vague about *why* beyond
 * "wrong", so the endpoint cannot be used to probe whether a gift exists.
 */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const { slug } = params;
  const key = clientKey(req, slug);

  const deny = (error: string, status = 400) =>
    Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });

  if (isLockedOut(key)) {
    return deny("Too many tries. Give it ten minutes and try again.", 429);
  }

  let pin = "";
  try {
    const body = await req.json();
    pin = String(body?.pin || "");
  } catch {
    return deny("Send a PIN.");
  }

  const gift = await prisma.gift.findUnique({ where: { slug } });
  // Same answer whether the gift is missing or the PIN is wrong.
  if (!gift || !gift.pinHash || !gift.pinSalt || !gift.unlockToken) {
    return deny("That PIN isn't right.", 401);
  }

  if (!pinMatches(pin, gift.pinSalt, gift.pinHash)) {
    const { lockedOut, remaining } = registerFailure(key);
    if (lockedOut) {
      return deny("Too many tries. Give it ten minutes and try again.", 429);
    }
    return deny(
      remaining <= 3
        ? `That PIN isn't right — ${remaining} ${remaining === 1 ? "try" : "tries"} left.`
        : "That PIN isn't right.",
      401
    );
  }

  clearFailures(key);
  const res = Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  res.headers.append(
    "set-cookie",
    [
      `${unlockCookieName(slug)}=${gift.unlockToken}`,
      `Path=/g/${encodeURIComponent(slug)}`,
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=31536000",
      process.env.NODE_ENV === "production" ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ")
  );
  return res;
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
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

  // ---- the lock ----
  // Checked before the template is even read, so a locked gift never has its
  // story assembled, let alone sent.
  if (gift.pinHash && gift.pinSalt && gift.unlockToken) {
    const cookie = req.cookies.get(unlockCookieName(slug))?.value;
    if (!tokenMatches(cookie, gift.unlockToken)) {
      const len = gift.pinLength || 4;
      const hint = gift.pinHint || defaultHint((gift.pinType as GiftPinType) || "custom", len);
      return lockPage(slug, hint, len);
    }
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
      // Projected onto the hologram couple's faces. Undefined when the
      // sender did not upload one, which leaves that figure's plain head.
      senderPhoto: gift.senderPhotoUrl || undefined,
      recipientPhoto: gift.recipientPhotoUrl || undefined,
    },
    finalMessage: {
      personal: gift.message || undefined,
      oneMoreThing: gift.oneMoreThing || undefined,
    },
    songUrl: gift.songUrl || undefined,
    memoryPhotos: gift.photos.length
      ? buildMemoryPhotos(
          gift.photos.map((p) => ({
            src: p.url,
            caption: p.caption || undefined,
            filter: p.filterApplied || undefined, // "cartoon" | "sample" | undefined
          }))
        )
      : undefined,
  };

  const overrideScript = `<script>window.GIFT_OVERRIDE = ${JSON.stringify(override)};<\/script>\n`;
  const html = template.includes(SCRIPT_MARKER)
    ? template.replace(SCRIPT_MARKER, overrideScript + SCRIPT_MARKER)
    : template; // template got edited and lost the marker — fail open with the default demo rather than 500

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Private: a gift may be behind a PIN, and a shared cache must not hand
      // the unlocked story to the next person on that connection.
      "cache-control": "private, no-store",
    },
  });
}

// Re-applies the same choreography (timing/position/rotation/depth) the
// default four memory photos use, just with the gift's own photo URLs —
// keeps the scene layout intact whether 1 or 4 photos were uploaded.
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
