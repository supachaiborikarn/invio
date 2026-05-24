import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { getDb } from "@/db";
import {
  invoiceAuditLogs,
  invoices,
  paymentEvents,
  paymentSessions,
  payments,
} from "@/db/schema";
import { deriveInvoiceStatus, nextRunningNo } from "@/lib/billing";

function receiptPrefixFromDate(value: Date) {
  return `RCPT-${value.getFullYear() + 543}${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function paymentIntentId(session: Stripe.Checkout.Session) {
  if (!session.payment_intent) return "";
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent.id;
}

export async function markStripeSessionFailed(
  eventId: string,
  eventType: string,
  session: Stripe.Checkout.Session,
) {
  const db = getDb();
  const invoiceId = session.metadata?.invoiceId ?? "";
  const [invoice] = invoiceId
    ? await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
    : [];

  if (!invoice) return;

  const [existingEvent] = await db
    .select()
    .from(paymentEvents)
    .where(eq(paymentEvents.eventId, eventId))
    .limit(1);

  if (existingEvent) return;

  await db.insert(paymentEvents).values({
    organizationId: invoice.organizationId,
    eventId,
    eventType,
    providerSessionId: session.id,
    providerPaymentId: paymentIntentId(session),
    payload: JSON.stringify(session),
  });

  await db
    .update(paymentSessions)
    .set({
      status: "failed",
      providerPaymentId: paymentIntentId(session),
      updatedAt: new Date(),
    })
    .where(eq(paymentSessions.providerSessionId, session.id));

  revalidatePath("/");
}

export async function recordStripeCheckoutPayment(
  eventId: string,
  eventType: string,
  session: Stripe.Checkout.Session,
) {
  const db = getDb();
  const invoiceId = session.metadata?.invoiceId ?? "";
  const [invoice] = invoiceId
    ? await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
    : [];

  if (!invoice) {
    throw new Error("ไม่พบใบแจ้งหนี้จาก Stripe metadata");
  }

  const [existingEvent] = await db
    .select()
    .from(paymentEvents)
    .where(eq(paymentEvents.eventId, eventId))
    .limit(1);

  if (existingEvent) return;

  const providerPaymentId = paymentIntentId(session);
  const [existingPayment] = await db
    .select()
    .from(payments)
    .where(eq(payments.providerSessionId, session.id))
    .limit(1);

  await db.insert(paymentEvents).values({
    organizationId: invoice.organizationId,
    eventId,
    eventType,
    providerSessionId: session.id,
    providerPaymentId,
    payload: JSON.stringify(session),
  });

  await db
    .update(paymentSessions)
    .set({
      status: "paid",
      providerPaymentId,
      updatedAt: new Date(),
    })
    .where(eq(paymentSessions.providerSessionId, session.id));

  if (existingPayment) {
    revalidatePath("/");
    return;
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(payments)
    .where(eq(payments.organizationId, invoice.organizationId));
  const amountSatang = Math.min(
    session.amount_total ?? invoice.balanceSatang,
    invoice.balanceSatang,
  );

  if (amountSatang <= 0) {
    await db.insert(invoiceAuditLogs).values({
      organizationId: invoice.organizationId,
      invoiceId: invoice.id,
      action: "stripe_payment_ignored",
      reason: "Invoice balance is already zero",
      metadata: eventId,
    });
    revalidatePath("/");
    return;
  }

  const paidSatang = Math.min(invoice.paidSatang + amountSatang, invoice.totalSatang);
  const balanceSatang = Math.max(invoice.totalSatang - paidSatang, 0);
  const receiptNo = nextRunningNo(
    receiptPrefixFromDate(new Date()),
    Number(countRow?.count ?? 0),
  );

  await db.insert(payments).values({
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    receiptNo,
    paidAt: new Date(),
    amountSatang,
    method: "promptpay",
    provider: "stripe",
    providerSessionId: session.id,
    providerPaymentId,
    webhookEventId: eventId,
    reference: providerPaymentId,
    notes: "รับเงินออนไลน์ผ่าน Stripe PromptPay",
  });

  await db
    .update(invoices)
    .set({
      paidSatang,
      balanceSatang,
      status: deriveInvoiceStatus({
        total: invoice.totalSatang / 100,
        paid: paidSatang / 100,
        dueDate: invoice.dueDate.toISOString(),
        issued: true,
      }),
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id));

  await db.insert(invoiceAuditLogs).values({
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    action: "stripe_payment_succeeded",
    reason: "Stripe webhook confirmed payment",
    metadata: eventId,
  });

  revalidatePath("/");
}
