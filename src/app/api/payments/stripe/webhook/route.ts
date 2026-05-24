import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  markStripeSessionFailed,
  recordStripeCheckoutPayment,
} from "@/lib/payment-processing";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { message: "ยังไม่ได้ตั้งค่า Stripe webhook" },
      { status: 503 },
    );
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ message: "ลายเซ็น Stripe ไม่ถูกต้อง" }, { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;

    if (
      event.type === "checkout.session.async_payment_succeeded" ||
      session.payment_status === "paid"
    ) {
      await recordStripeCheckoutPayment(event.id, event.type, session);
    }
  }

  if (event.type === "checkout.session.async_payment_failed") {
    await markStripeSessionFailed(
      event.id,
      event.type,
      event.data.object as Stripe.Checkout.Session,
    );
  }

  return NextResponse.json({ received: true });
}

