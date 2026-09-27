import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { TEST_MODE } from "@/lib/testMode";

export async function POST(req: NextRequest) {
  // Unreachable from the UI in test mode, but a stray call should say why
  // rather than fail as a missing-credentials 500.
  if (TEST_MODE) {
    return NextResponse.json(
      { error: "Payment verification is switched off in test mode — there is nothing to verify." },
      { status: 503 }
    );
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      await req.json();

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET as string)
      .update(body)
      .digest("hex");

    const isValid = expectedSignature === razorpay_signature;

    if (!isValid) {
      return NextResponse.json({ error: "Payment could not be verified." }, { status: 400 });
    }

    const order = await prisma.order.update({
      where: { razorpayOrderId: razorpay_order_id },
      data: { status: "paid", razorpayPaymentId: razorpay_payment_id },
    });

    return NextResponse.json({ verified: true, orderId: order.id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Verification failed." }, { status: 500 });
  }
}
