/**
 * testMode.ts — one switch that takes the paid pipeline out of the way so the
 * whole gift flow can be exercised end to end.
 *
 * What test mode turns off, and why each one blocks a plain test run:
 *
 *  - Razorpay. The real flow is: pay -> a paid Order row -> /create?orderId=…
 *    -> /api/gifts checks the Order is paid. No keys, no payment, no order,
 *    no gift. In test mode "Create their surprise" goes straight to the
 *    details form and /api/gifts skips the paid-order check entirely.
 *  - Google Drive. Photos, the song and the two portrait faces are uploaded
 *    to a Drive folder owned by a service account. Without those credentials
 *    every upload throws. In test mode the files are downscaled and inlined
 *    as data URLs instead, so faces and memories still show up in the story.
 *  - The database. The schema has columns that no migration has ever created
 *    (there is no prisma/migrations directory), and on Vercel the SQLite file
 *    lives on a disk that is wiped on every cold start. In test mode nothing
 *    touches Prisma: gifts are kept by lib/giftStore.ts.
 *
 * Everything that is actually being tested still runs for real: the details
 * form, gift assembly, the story template, GIFT_OVERRIDE, the hologram faces,
 * the PIN gate (hashed with the same scrypt code and checked on the server),
 * and the /g/<slug> route that serves it.
 *
 * DEFAULT: ON. It has to be, because the point is that a fresh deployment
 * with no secrets configured can be tested. Set NEXT_PUBLIC_TEST_MODE=0 in
 * the environment to put the real paid flow back.
 *
 * Read on the client too, so it must be NEXT_PUBLIC_ — Next inlines it at
 * build time, which also means changing it needs a redeploy, not just a
 * restart.
 */
export const TEST_MODE = process.env.NEXT_PUBLIC_TEST_MODE !== "0";

/** Shown on the pages that behave differently, so a test link is never mistaken for a real sale. */
export const TEST_MODE_NOTE =
  "Test mode — payment is switched off and nothing is charged.";
