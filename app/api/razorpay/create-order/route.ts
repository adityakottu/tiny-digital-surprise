import { NextRequest, NextResponse } from "next/server";
import { razorpay, OFFER_AMOUNT_PAISE } from "@/lib/razorpay";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();

    if (!phone || !/^\d{10}$/.test(phone)) {
      return NextResponse.json(
        { error: "Enter a valid 10-digit mobile number." },
        { status: 400 }
      );
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: OFFER_AMOUNT_PAISE,
      currency: "INR",
      receipt: `dl_${Date.now()}`,
      notes: { phone },
    });

    await prisma.order.create({
      data: {
        razorpayOrderId: razorpayOrder.id,
        phone,
        amount: OFFER_AMOUNT_PAISE,
        status: "created",
      },
    });

    return NextResponse.json({
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 500 }
    );
  }
}
