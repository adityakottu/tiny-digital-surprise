import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
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
