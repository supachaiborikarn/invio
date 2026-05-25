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
  tenants,
} from "@/db/schema";
import { deriveInvoiceStatus, nextRunningNo } from "@/lib/billing";
import { isResendConfigured } from "@/lib/dashboard-data";
import { getBillingEmailFrom, getResend } from "@/lib/email";
import { createPortalLinkForTenant } from "@/lib/portal-links";

function receiptPrefixFromDate(value: Date) {
  return `RCPT-${value.getFullYear() + 543}${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function paymentIntentId(session: Stripe.Checkout.Session) {
  if (!session.payment_intent) return "";
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent.id;
}

async function sendStripeReceiptEmail(input: {
  invoice: typeof invoices.$inferSelect;
  paymentId: string;
  receiptNo: string;
  amountSatang: number;
}) {
  if (!isResendConfigured()) return;

  const db = getDb();
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, input.invoice.tenantId))
    .limit(1);

  if (!tenant?.email) return;

  const link = await createPortalLinkForTenant(tenant.id, null);
  const receiptUrl = `${link.url}/receipt/${input.paymentId}`;
  const { error } = await getResend().emails.send({
    from: getBillingEmailFrom(),
    to: tenant.email,
    subject: `ใบเสร็จ ${input.receiptNo}`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.6">
        <h2>ใบเสร็จ ${input.receiptNo}</h2>
        <p>เรียน ${tenant.name}</p>
        <p>ระบบได้รับเงินผ่าน Stripe PromptPay สำหรับใบแจ้งหนี้ ${input.invoice.invoiceNo} แล้ว</p>
        <p>ยอดรับชำระ ${(input.amountSatang / 100).toLocaleString("th-TH", { style: "currency", currency: "THB" })}</p>
        <p><a href="${receiptUrl}">เปิดใบเสร็จ</a></p>
      </div>
    `,
  });

  await db.insert(invoiceAuditLogs).values({
    organizationId: input.invoice.organizationId,
    invoiceId: input.invoice.id,
    action: error ? "receipt_email_failed" : "receipt_email_sent",
    reason: error?.message ?? input.receiptNo,
  });
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

  const [payment] = await db
    .insert(payments)
    .values({
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
    })
    .returning({ id: payments.id });

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

  await sendStripeReceiptEmail({
    invoice,
    paymentId: payment.id,
    receiptNo,
    amountSatang,
  });

  revalidatePath("/");
}
