# Tiny Digital Surprise

A full-stack "personalized digital gift" app: a customer pays, fills in
names/an occasion/a message/up to 4 photos, and gets back a private,
**2-year** shareable link to an interactive, scroll-driven love story made
just for the recipient.

This is an **original build** — its own name, copy, art and design.

## Stack

- **Next.js 14** (App Router, TypeScript) — landing page, builder, and API
  routes in one app
- **Prisma + SQLite** for data (swap `DATABASE_URL` for Postgres before
  real traffic — see "Production notes")
- **Razorpay** for payment (order creation + server-side signature
  verification — the client's success callback is never trusted alone)
- **Google Drive** (via a service account) for storing uploaded photos/songs
  — no paid blob storage needed
- An optional **cartoon filter** — a real, local image-processing effect
  (posterize + ink outlines, via `sharp`) applied to the boy/girl photo
  uploads. Genuinely free: no API key, no signup, no external calls, no
  usage limit (see "Cartoon filter" below)
- The gift experience itself (`lib/story-template.html` + `public/story/`)
  is the same plain HTML/CSS/JS + GSAP ScrollTrigger scroll-story built
  earlier in this project, now served dynamically per gift instead of as a
  static file

## ⚠️ Before you run this

This was built and reviewed in an environment where `npm install` couldn't
reach the npm registry, so **I was not able to run `npm install` or
`npm run build` here** — everything was checked by careful manual review
(schema/field consistency, brace/paren balance, and a live browser test of
the actual gift-experience template with a simulated override), but not
compiled. Run `npm install && npm run build` yourself before deploying, and
open an issue with me if it surfaces anything — I'd want to fix it.

## Getting started

```bash
npm install
cp .env.example .env      # then fill in real/dummy values — see below
npx prisma migrate dev --name init
npm run dev
```

> If you're updating an existing local DB rather than starting fresh, run
> `npx prisma migrate dev --name add_photo_filter` once after pulling these
> changes — the `Photo` model gained a `filterApplied` column for the
> cartoon-filter feature below.

Visit `http://localhost:3000`.

### Razorpay keys (dummy/test is fine to start)

1. Sign up at https://dashboard.razorpay.com
2. Switch to **Test Mode** (toggle top-right)
3. Settings → API Keys → Generate Test Key
4. Put `key_id` in both `RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID`,
   and `key_secret` in `RAZORPAY_KEY_SECRET`
5. Test card: `4111 1111 1111 1111`, any future expiry, any CVV

### Google Drive (required for photo/song uploads)

Drive storage needs a **service account**, not your personal Google login,
so the app can upload without anyone being signed in:

1. https://console.cloud.google.com → new project.
2. APIs & Services → Library → enable the **Google Drive API**.
3. IAM & Admin → Service Accounts → Create → skip the optional grant steps.
4. Open the new service account → Keys → Add Key → **JSON** → downloads a
   file. Open it — you need `client_email` and `private_key` from it.
5. In Google Drive, create a folder (e.g. "Tiny Digital Surprise uploads"),
   right-click → Share → paste the service account's `client_email` → give
   it **Editor** access.
6. Copy the folder's ID from its URL:
   `drive.google.com/drive/folders/`**`THIS_PART`**
7. In `.env`:
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL=<client_email from the JSON>
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="<private_key from the JSON, keep the \n escapes>"
   GOOGLE_DRIVE_FOLDER_ID=<the folder ID>
   ```

Until these are set, gift creation will fail with a clear error message
(rather than a silent crash) telling you which one is missing.

### Cartoon filter (built in, genuinely free — no signup, no key, no cost)

On the builder page, there's an **"✨ Apply cartoon filter"** checkbox next
to the photo uploader. This is deliberately **not** a call to a hosted AI
image API — there's no such thing as an unlimited, truly-free one (Replicate,
Stability, OpenAI images, etc. are all metered and eventually ask for a
card). Instead, `lib/cartoonify.ts` runs a real image-processing
"cartoonizer" locally with the `sharp` library, entirely on your own server:

1. Smooth the photo (denoise + blur) and lift saturation/brightness for a
   bright, flat "cel-shaded" base.
2. **Posterize** — collapse each color channel to a handful of flat levels.
   This is the main thing that reads as "cartoon": flat color regions
   instead of photographic gradients.
3. Edge-detect the original photo and multiply-blend the resulting ink
   outlines back on top, so faces/features get a drawn "line art" edge.

Zero external calls, zero API keys, zero signup, zero rate limits, works
offline — it's just pixel math, so it costs nothing at any volume. It never
blocks gift creation: if a photo is corrupt or an unsupported format, it
falls back to leaving the photo as-is with a pure-CSS "sample filter" look
instead (warmer tones, lifted saturation — see `.photo-filter-sample` in
`public/story/css/style.css`).

Each photo remembers which tier it got (`Photo.filterApplied`: `"cartoon"`
or `"sample"`) so the surprise can show the right look and a small badge.
Tune the effect strength via `POSTER_LEVELS` in `lib/cartoonify.ts` (fewer
levels = more cartoonish/flat, more levels = subtler).

## How it's wired together

1. `/` — landing/purchase page. Customer enters phone number →
   `POST /api/razorpay/create-order` creates a Razorpay order and an `Order`
   row (`status: created`) → Razorpay Checkout opens client-side.
2. On successful payment, the client posts the payment response to
   `POST /api/razorpay/verify`, which checks the HMAC signature server-side
   and flips the order to `status: paid`.
3. Customer is redirected to `/create?orderId=...` — the builder: their
   name, sender name, occasion (prefills the message, still editable),
   personal message, "One More Thing…" bonus message, up to 4 photos (with
   an optional cartoon-filter toggle), an optional song. `POST /api/gifts`:
   - re-checks the order is `paid` (an unpaid order can never produce a gift,
     even by hitting the API directly),
   - if the cartoon filter was toggled on, runs each photo through
     `cartoonifyImage()` first — the free local posterize/ink-outline
     effect, or the sample-filter fallback if that fails for a given photo
     (see "Cartoon filter" above),
   - uploads each photo/song to Google Drive and stores the resulting link,
   - sets `expiresAt` to **2 years from now**,
   - creates the `Gift` row with a random `slug`.
4. The gift is served at `GET /g/[slug]` (`app/g/[slug]/route.ts`) — not a
   React page, a route handler that:
   - looks up the gift, 404s if it doesn't exist,
   - 410s with a graceful "this link has expired" page past `expiresAt`,
   - reads `lib/story-template.html`, injects a
     `<script>window.GIFT_OVERRIDE = {...}</script>` with that gift's data
     right before `story.js` loads, and serves the result.
   The story's own JS (`public/story/js/story.js`) merges that override over
   its built-in defaults, so the same template serves every gift.

## Production notes

- **Database**: switch `datasource db` in `prisma/schema.prisma` from
  `sqlite` to `postgresql` and point `DATABASE_URL` at a real Postgres
  instance (Supabase, Neon, Railway, etc.) before launch.
- **Expiry enforcement**: `expiresAt` is checked on every request to
  `/g/[slug]`, so nothing needs to actively delete old gifts — they just
  stop being servable. If you also want to reclaim Drive storage, add a
  scheduled job that deletes Drive files (and DB rows) for gifts whose
  `expiresAt` has passed.
- **Webhooks**: for extra reliability, also configure a Razorpay webhook
  (`payment.captured`) pointing at a new API route, so payments are
  recorded even if the customer closes the tab right after paying.
- **Rate limiting / abuse**: add basic rate limiting to `create-order` and
  `gifts` so the endpoints (and your Drive quota) can't be spammed.
- **Google Drive quota**: a personal Google account's Drive has a daily API
  usage quota and 15GB of free storage shared with everything else in that
  account — fine for testing, but for real volume consider a dedicated
  Google Workspace account (or move to S3/R2 later; `lib/googleDrive.ts` is
  a single, swappable module).
- **Compliance**: add real Terms, Privacy, and Refund pages — the footer
  links are placeholders (`/terms`, `/privacy`, `/refund`).

## Deploy (GitHub → Vercel)

1. Push this repo to GitHub.
2. https://vercel.com → New Project → import that repo.
3. Add all the `.env` variables in Vercel's Project Settings → Environment
   Variables (same names as `.env.example`).
4. Switch `prisma/schema.prisma`'s datasource to `postgresql` first (see
   above) — Vercel's filesystem is read-only/ephemeral, so SQLite won't
   persist there.
5. Deploy. Every push to `main` redeploys automatically.

## Project structure

```
app/
  page.tsx                    landing/purchase page
  create/page.tsx             gift builder (post-payment)
  g/[slug]/route.ts            serves the personalised gift page (410 if expired)
  api/razorpay/create-order/route.ts
  api/razorpay/verify/route.ts
  api/gifts/route.ts           creates the gift: Drive upload + 2yr expiry + DB row
components/                   shared UI (photo uploader, countdown, testimonials, etc.)
lib/
  prisma.ts                   Prisma client singleton
  razorpay.ts                 Razorpay client + pricing constants
  googleDrive.ts               Drive upload/delete helpers (service account)
  cartoonify.ts                free local cartoon filter (sharp) + sample-filter fallback
  story-template.html         the gift experience's HTML, read + personalised per request
prisma/schema.prisma          Order, Gift, Photo models
public/story/                the gift experience's CSS/JS/vendor/placeholder assets
  css/                        style.css, animations.css, responsive.css
  js/                         story.js, animations.js, audio.js, interactions.js, main.js, vendor/
  assets/photos/              placeholder photos (fallback for any un-filled slot)
```
