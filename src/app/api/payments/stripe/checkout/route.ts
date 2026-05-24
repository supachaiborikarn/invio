import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { paymentSessions } from "@/db/schema";
import { getPortalInvoiceDocument } from "@/lib/dashboard-data";
import { hashPortalToken } from "@/lib/portal";
import { getStripe } from "@/lib/stripe";
import { toSatang } from "@/lib/billing";

export const runtime = "nodejs";

const requestSchema = z.object({
  token: z.string().min(1),
  invoiceId: z.string().uuid(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const portal = await getPortalInvoiceDocument(
    parsed.data.token,
    parsed.data.invoiceId,
  );

  if (!portal) {
    return NextResponse.json({ message: "ไม่พบใบแจ้งหนี้" }, { status: 404 });
  }

  if (!portal.data.databaseConfigured) {
    return NextResponse.json(
      { message: "โหมด demo ยังไม่เปิดรับเงินออนไลน์" },
      { status: 503 },
    );
  }

  if (!portal.data.stripeConfigured) {
    return NextResponse.json(
      { message: "ยังไม่ได้ตั้งค่า Stripe" },
      { status: 503 },
    );
  }

  if (portal.invoice.balance <= 0 || portal.invoice.status === "void") {
    return NextResponse.json(
      { message: "ใบแจ้งหนี้นี้ไม่มียอดค้างชำระ" },
      { status: 400 },
    );
  }

  const amountSatang = toSatang(portal.invoice.balance);
  const invoiceUrl = `${portal.data.appUrl}/portal/${parsed.data.token}/invoice/${portal.invoice.id}`;
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["promptpay"],
    customer_email: portal.tenant.email || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "thb",
          unit_amount: amountSatang,
          product_data: {
            name: `ใบแจ้งหนี้ ${portal.invoice.invoiceNo}`,
            description: portal.tenant.name,
          },
        },
      },
    ],
    metadata: {
      invoiceId: portal.invoice.id,
      tenantId: portal.tenant.id,
      organizationId: portal.data.organization.id,
      portalTokenHash: hashPortalToken(parsed.data.token),
    },
    success_url: `${invoiceUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${invoiceUrl}?payment=cancel`,
  });

  await getDb().insert(paymentSessions).values({
    organizationId: portal.data.organization.id,
    invoiceId: portal.invoice.id,
    tenantId: portal.tenant.id,
    provider: "stripe",
    status: "open",
    amountSatang,
    currency: "thb",
    providerSessionId: session.id,
    checkoutUrl: session.url ?? "",
    portalTokenHash: hashPortalToken(parsed.data.token),
    expiresAt: session.expires_at
      ? new Date(session.expires_at * 1000)
      : undefined,
  });

  return NextResponse.json({ url: session.url });
}

