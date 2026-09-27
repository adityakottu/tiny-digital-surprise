# Testing the whole thing end to end

The site ships with **test mode on**. That takes three things out of the way
that otherwise stop a plain test run dead:

| Switched off | Why it blocked testing |
|---|---|
| **Razorpay** | The real flow is pay → paid `Order` row → `/create?orderId=…` → `/api/gifts` checks the order is paid. With no keys there is no payment, so no order, so no gift. |
| **Google Drive** | Photos, the song and the two portrait faces upload to a Drive folder owned by a service account. With no credentials every upload throws. |
| **The database** | The schema has columns that no migration has ever created (there is no `prisma/migrations` directory), and on Vercel the SQLite file sits on a disk that is wiped on every cold start. |

Everything that is actually being tested still runs for real: the details
form, gift assembly, the story template and `GIFT_OVERRIDE`, the hologram
faces, the ten chapters, and the PIN gate — hashed with the same scrypt code
and still checked on the server before any of the story is sent.

## The run

1. Open `/`. A banner says test mode; there is no phone field and the Razorpay
   script is not loaded.
2. Press **Create their surprise** → straight to `/create?test=1`.
3. Fill it in. A message is the only required field. Optionally add up to 4
   photos, a song, the two passport-style portraits, and a PIN.
4. Submit → you land on `/g/<slug>`.
   - With a PIN: the lock screen. The story is not in that page at all — view
     source and there is no `GIFT_OVERRIDE` and no `story.js`. Punctuation and
     capitals are ignored, so `25/12/2015` and `25122015` are the same PIN.
     Ten wrong tries in ten minutes locks the attempt out.
   - Without: the story opens.
5. **Enter Our Story** and scroll. Your names, message, photos, portraits on
   the holographic couple's faces, and the "One More Thing…" note are all
   yours.

To put the real paid flow back, set `NEXT_PUBLIC_TEST_MODE=0` in the
environment and redeploy. It is read on the client, so Next inlines it at
build time — a restart alone will not do it.

## What is different about a test-mode gift

**Uploads travel inside the gift.** There is no Drive to put them in, so
images are re-encoded to WebP (portraits 384px, memory photos 800px) and
embedded as data URLs. Two consequences worth knowing:

- A song is only carried if it is **under 3MB**. Audio cannot be shrunk
  without ffmpeg, which is not installed. Over that, the story keeps its
  default track and the form tells you so before it leaves the page.
- Anything `sharp` cannot read (a renamed file, a truncated download) is left
  out and reported, rather than put in the story as a broken picture.

**Links are temporary.** A test gift lives in the serverless instance's memory
and in its temp directory — not in a database. Neither follows an instance
that has been recycled, and `/tmp` is not shared between instances.

So the details form keeps a copy of the gift in the creating browser's
`localStorage`. When `/g/<slug>` cannot find the gift, it serves a small
recovery page that offers that copy back to the server
(`POST /api/gifts/restore`) and reloads into the ordinary story route — which
then renders it, PIN gate and all. The practical effect:

- **In the browser that made it:** the link keeps working.
- **Anywhere else, after the instance is recycled:** honestly reported as gone,
  with a prompt to make a new one. Sending a test link to someone else's phone
  works right after you create it, and stops working once the instance goes.

Recovery regenerates the salt and the unlock token, so an unlock cookie from
before the recovery stops working and the PIN is asked for again — the safe
direction for a gate to fail in.

## Before this is a real product

Test mode exists to make the experience testable, not to stand in for the
missing pieces. For real, paid gifts you still need:

- **A migration.** `prisma migrate dev` to create the initial migration for
  the whole schema, then `prisma migrate deploy` in the build command.
  Until then the Prisma client knows about `senderPhotoUrl`,
  `recipientPhotoUrl`, `pinHash`, `pinSalt`, `pinType`, `pinHint`,
  `pinLength` and `unlockToken`, and no database has them.
- **A database that persists.** SQLite on Vercel loses every order and gift on
  a cold start. Postgres (Vercel Postgres, Neon, Supabase) is the change.
- **The environment variables:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
  `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_DRIVE_FOLDER_ID`,
  `DATABASE_URL`, and `NEXT_PUBLIC_TEST_MODE=0`.
- **`assets/music/theme.mp3`**, which is still missing, so the default track
  has nothing to play.

## Locally

```bash
npm install
npm run build && npm start     # no env vars needed in test mode
```

Then walk the run above at `http://localhost:3000`.
