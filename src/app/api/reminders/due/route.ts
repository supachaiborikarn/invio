import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, hasDatabase } from "@/db";
import { invoiceAuditLogs, invoices, tenants } from "@/db/schema";
import { getBillingEmailFrom, getResend } from "@/lib/email";
import { isResendConfigured } from "@/lib/dashboard-data";
import { createPortalLinkForTenant } from "@/lib/portal-links";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const secret = process.env.REMINDER_API_SECRET || process.env.CRON_SECRET;

  if (!secret) return process.env.NODE_ENV !== "production";

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.replace(/^Bearer\s+/i, "");
  return bearer === secret || request.headers.get("x-reminder-secret") === secret;
}

async function handleReminder(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "ไม่ได้รับอนุญาต" }, { status: 401 });
  }

  if (!hasDatabase()) {
    return NextResponse.json(
      { message: "ยังไม่ได้ตั้งค่า DATABASE_URL" },
      { status: 503 },
    );
  }

  if (!isResendConfigured()) {
    return NextResponse.json(
      { message: "ยังไม่ได้ตั้งค่า Resend" },
      { status: 503 },
    );
  }

  const db = getDb();
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const dueSoon = new Date(today);
  dueSoon.setDate(dueSoon.getDate() + 3);

  const [invoiceRows, tenantRows, auditRows] = await Promise.all([
    db.select().from(invoices),
    db.select().from(tenants),
    db
      .select()
      .from(invoiceAuditLogs)
      .where(eq(invoiceAuditLogs.action, "due_reminder_sent")),
  ]);
  const overdueAuditRows = await db
    .select()
    .from(invoiceAuditLogs)
    .where(eq(invoiceAuditLogs.action, "overdue_reminder_sent"));
  const sentToday = new Set(
    [...auditRows, ...overdueAuditRows]
      .filter((row) => row.createdAt.toISOString().slice(0, 10) === todayKey)
      .map((row) => row.invoiceId),
  );
  const resend = getResend();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const invoice of invoiceRows) {
    const isOpenStatus = ["issued", "partial", "overdue"].includes(invoice.status);
    const shouldRemind =
      isOpenStatus &&
      invoice.balanceSatang > 0 &&
      invoice.dueDate.getTime() <= dueSoon.getTime();

    if (!shouldRemind || sentToday.has(invoice.id)) {
      skipped += 1;
      continue;
    }

    const tenant = tenantRows.find((item) => item.id === invoice.tenantId);
    if (!tenant?.email) {
      skipped += 1;
      continue;
    }

    const isOverdue = invoice.dueDate.getTime() < today.getTime();
    const link = await createPortalLinkForTenant(tenant.id, null);
    const invoiceUrl = `${link.url}/invoice/${invoice.id}`;
    const subject = isOverdue
      ? `แจ้งเตือนยอดค้างชำระ ${invoice.invoiceNo}`
      : `แจ้งเตือนกำหนดชำระ ${invoice.invoiceNo}`;
    const { error } = await resend.emails.send({
      from: getBillingEmailFrom(),
      to: tenant.email,
      subject,
      html: `
        <div style="font-family: sans-serif; line-height: 1.6">
          <h2>${subject}</h2>
          <p>เรียน ${tenant.name}</p>
          <p>ใบแจ้งหนี้ ${invoice.invoiceNo} มียอดค้างชำระ ${(invoice.balanceSatang / 100).toLocaleString("th-TH", { style: "currency", currency: "THB" })}</p>
          <p>กำหนดชำระ ${invoice.dueDate.toLocaleDateString("th-TH")}</p>
          <p><a href="${invoiceUrl}">เปิดใบแจ้งหนี้และชำระเงิน</a></p>
        </div>
      `,
    });

    if (error) {
      failed += 1;
      continue;
    }

    await db.insert(invoiceAuditLogs).values({
      organizationId: invoice.organizationId,
      invoiceId: invoice.id,
      action: isOverdue ? "overdue_reminder_sent" : "due_reminder_sent",
      reason: "ส่งอีเมลแจ้งเตือนจาก reminder API",
    });
    sent += 1;
  }

  return NextResponse.json({ sent, skipped, failed });
}

export async function GET(request: Request) {
  return handleReminder(request);
}

export async function POST(request: Request) {
  return handleReminder(request);
}
