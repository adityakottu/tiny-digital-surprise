import Razorpay from "razorpay";

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID as string,
  key_secret: process.env.RAZORPAY_KEY_SECRET as string,
});

// Current launch offer, in paise (₹199 -> 19900)
export const OFFER_AMOUNT_PAISE = 19900;
export const ORIGINAL_AMOUNT_PAISE = 99900;
