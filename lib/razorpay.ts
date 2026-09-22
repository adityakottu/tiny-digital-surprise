import Razorpay from "razorpay";

// Razorpay's constructor throws if the keys are missing, so we must not build
// the client while the module is being imported — Next's production build
// imports every route module to collect page data, and on a host like Vercel
// the build step may run before/without the runtime env vars, which would
// fail the whole build. Create it lazily, on the first request instead.
let client: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (client) return client;

  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error(
      "Razorpay isn't configured yet — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
    );
  }

  client = new Razorpay({ key_id, key_secret });
  return client;
}

// Current launch offer, in paise (₹199 -> 19900)
export const OFFER_AMOUNT_PAISE = 19900;
export const ORIGINAL_AMOUNT_PAISE = 99900;
