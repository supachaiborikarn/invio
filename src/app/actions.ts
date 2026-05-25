"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, hasDatabase } from "@/db";
import {
  appUsers,
  billingCycles,
  invoiceAuditLogs,
  invoiceItems,
  invoices,
  meterReadings,
  organizations,
  payments,
  rentalUnits,
  tenantPortalLinks,
  tenants,
} from "@/db/schema";
import { requireAppUser, type AuthResult } from "@/lib/auth";
import {
  calculateElectricityCharge,
  calculateInvoiceTotals,
  deriveInvoiceStatus,
  nextRunningNo,
  toSatang,
} from "@/lib/billing";
import { getBillingEmailFrom, getResend } from "@/lib/email";
import { isResendConfigured } from "@/lib/dashboard-data";
import { createPortalLinkForTenant } from "@/lib/portal-links";
import type { InvoiceItem, InvoiceType } from "@/lib/types";

type ActionResult = {
  ok: boolean;
  message: string;
};

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberValue(formData: FormData, key: string) {
  return Number(String(formData.get(key) ?? "0").replace(/,/g, ""));
}

function booleanValue(formData: FormData, key: string) {
  return ["on", "yes", "true", "1"].includes(textValue(formData, key));
}

type ActionFailure = { ok: false; message: string };
type StaffActionAuth = Extract<AuthResult, { ok: true }> | ActionFailure;

async function requireStaffAction(): Promise<StaffActionAuth> {
  const user = await requireAppUser();

  if (!user.ok) {
    return { ok: false, message: user.message };
  }

  return user;
}

async function requireAdminAction(): Promise<StaffActionAuth> {
  const user = await requireStaffAction();

  if (!user.ok) return user;
  if (user.role !== "admin") {
    return { ok: false, message: "ต้องเป็นแอดมินก่อนทำรายการนี้" };
  }

  return user;
}

async function getDefaultOrganizationId() {
  const db = getDb();
  const [existing] = await db.select().from(organizations).limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(organizations)
    .values({
      name: "องค์กรของฉัน",
      vatRateBasisPoints: 700,
      vatEnabledDefault: true,
    })
    .returning({ id: organizations.id });

  return created.id;
}

function requireDatabase(): ActionResult | null {
  if (hasDatabase()) return null;

  return {
    ok: false,
    message: "ยังไม่ได้ตั้งค่า DATABASE_URL จึงบันทึกลง Neon ไม่ได้",
  };
}

function invoicePrefixFromDate(value: Date) {
  return `INV-${value.getFullYear() + 543}${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function receiptPrefixFromDate(value: Date) {
  return `RCPT-${value.getFullYear() + 543}${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function toDateValue(value: string) {
  return new Date(`${value}T00:00:00`);
}

const tenantSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  contactName: z.string().optional(),
  taxId: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  billingAddress: z.string().optional(),
  vatEnabled: z.boolean(),
});

export async function createTenantAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const parsed = tenantSchema.safeParse({
    code: textValue(formData, "code"),
    name: textValue(formData, "name"),
    contactName: textValue(formData, "contactName"),
    taxId: textValue(formData, "taxId"),
    phone: textValue(formData, "phone"),
    email: textValue(formData, "email"),
    billingAddress: textValue(formData, "billingAddress"),
    vatEnabled: booleanValue(formData, "vatEnabled"),
  });

  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลผู้เช่าไม่ครบ" };
  }

  const db = getDb();
  const organizationId = await getDefaultOrganizationId();

  await db.insert(tenants).values({
    organizationId,
    ...parsed.data,
  });

  revalidatePath("/");
  return { ok: true, message: "เพิ่มผู้เช่าแล้ว" };
}

export async function updateTenantAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const tenantId = textValue(formData, "tenantId");
  const parsed = tenantSchema.safeParse({
    code: textValue(formData, "code"),
    name: textValue(formData, "name"),
    contactName: textValue(formData, "contactName"),
    taxId: textValue(formData, "taxId"),
    phone: textValue(formData, "phone"),
    email: textValue(formData, "email"),
    billingAddress: textValue(formData, "billingAddress"),
    vatEnabled: booleanValue(formData, "vatEnabled"),
  });

  if (!tenantId || !parsed.success) {
    return { ok: false, message: "ข้อมูลผู้เช่าไม่ครบ" };
  }

  await getDb()
    .update(tenants)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  revalidatePath("/");
  return { ok: true, message: "แก้ไขผู้เช่าแล้ว" };
}

const unitSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  tenantId: z.string().uuid(),
  rentAmount: z.number().min(0),
  electricRate: z.number().min(0),
  meterSerial: z.string().optional(),
});

const updateUnitSchema = unitSchema.extend({
  tenantId: z.string().uuid().optional().or(z.literal("")),
});

export async function createUnitAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const parsed = updateUnitSchema.safeParse({
    code: textValue(formData, "code"),
    name: textValue(formData, "name"),
    tenantId: textValue(formData, "tenantId"),
    rentAmount: numberValue(formData, "rentAmount"),
    electricRate: numberValue(formData, "electricRate"),
    meterSerial: textValue(formData, "meterSerial"),
  });

  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลพื้นที่ไม่ครบ" };
  }

  const db = getDb();
  const organizationId = await getDefaultOrganizationId();

  await db.insert(rentalUnits).values({
    organizationId,
    tenantId: parsed.data.tenantId || null,
    code: parsed.data.code,
    name: parsed.data.name,
    rentAmountSatang: toSatang(parsed.data.rentAmount),
    electricRateSatang: toSatang(parsed.data.electricRate),
    meterSerial: parsed.data.meterSerial,
    status: parsed.data.tenantId ? "occupied" : "vacant",
  });

  revalidatePath("/");
  return { ok: true, message: "เพิ่มพื้นที่เช่าแล้ว" };
}

export async function updateUnitAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const unitId = textValue(formData, "unitId");
  const status = textValue(formData, "status");
  const parsed = updateUnitSchema.safeParse({
    code: textValue(formData, "code"),
    name: textValue(formData, "name"),
    tenantId: textValue(formData, "tenantId"),
    rentAmount: numberValue(formData, "rentAmount"),
    electricRate: numberValue(formData, "electricRate"),
    meterSerial: textValue(formData, "meterSerial"),
  });

  if (
    !unitId ||
    !parsed.success ||
    !["occupied", "vacant", "maintenance"].includes(status)
  ) {
    return { ok: false, message: "ข้อมูลพื้นที่ไม่ครบ" };
  }

  await getDb()
    .update(rentalUnits)
    .set({
      tenantId: status === "occupied" ? parsed.data.tenantId || null : null,
      code: parsed.data.code,
      name: parsed.data.name,
      rentAmountSatang: toSatang(parsed.data.rentAmount),
      electricRateSatang: toSatang(parsed.data.electricRate),
      meterSerial: parsed.data.meterSerial,
      status: status as "occupied" | "vacant" | "maintenance",
      updatedAt: new Date(),
    })
    .where(eq(rentalUnits.id, unitId));

  revalidatePath("/");
  return { ok: true, message: "แก้ไขพื้นที่เช่าแล้ว" };
}

export async function updateOrganizationAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireAdminAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const organizationId = await getDefaultOrganizationId();

  await getDb()
    .update(organizations)
    .set({
      name: textValue(formData, "name") || "องค์กรของฉัน",
      taxId: textValue(formData, "taxId"),
      address: textValue(formData, "address"),
      phone: textValue(formData, "phone"),
      email: textValue(formData, "email"),
      vatRateBasisPoints: Math.round(numberValue(formData, "vatRate") * 100),
      vatEnabledDefault: booleanValue(formData, "vatEnabledDefault"),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));

  revalidatePath("/");
  return { ok: true, message: "แก้ไขข้อมูลบริษัทแล้ว" };
}

export async function updateUserRoleAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireAdminAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const userId = textValue(formData, "userId");
  const role = textValue(formData, "role");

  if (!userId || !["admin", "staff"].includes(role)) {
    return { ok: false, message: "ข้อมูลผู้ใช้ไม่ครบ" };
  }

  await getDb()
    .update(appUsers)
    .set({ role: role as "admin" | "staff" })
    .where(eq(appUsers.id, userId));

  revalidatePath("/");
  return { ok: true, message: "อัปเดตสิทธิ์ผู้ใช้แล้ว" };
}

const cycleSchema = z.object({
  label: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  dueDate: z.string().min(1),
  status: z.enum(["draft", "open", "closed"]),
  closeCurrentCycleId: z.string().uuid().optional().or(z.literal("")),
});

export async function createBillingCycleAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const parsed = cycleSchema.safeParse({
    label: textValue(formData, "label"),
    periodStart: textValue(formData, "periodStart"),
    periodEnd: textValue(formData, "periodEnd"),
    dueDate: textValue(formData, "dueDate"),
    status: textValue(formData, "status") || "open",
    closeCurrentCycleId: textValue(formData, "closeCurrentCycleId"),
  });

  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลรอบบิลไม่ครบ" };
  }

  const db = getDb();
  const organizationId = await getDefaultOrganizationId();

  if (parsed.data.status === "open") {
    await db
      .update(billingCycles)
      .set({ status: "closed" })
      .where(
        and(
          eq(billingCycles.organizationId, organizationId),
          eq(billingCycles.status, "open"),
        ),
      );
  }

  await db.insert(billingCycles).values({
    organizationId,
    label: parsed.data.label,
    periodStart: toDateValue(parsed.data.periodStart),
    periodEnd: toDateValue(parsed.data.periodEnd),
    dueDate: toDateValue(parsed.data.dueDate),
    status: parsed.data.status,
  });

  if (parsed.data.closeCurrentCycleId) {
    await db
      .update(billingCycles)
      .set({ status: "closed" })
      .where(eq(billingCycles.id, parsed.data.closeCurrentCycleId));
  }

  revalidatePath("/");
  return { ok: true, message: "สร้างรอบบิลแล้ว" };
}

export async function updateBillingCycleStatusAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const cycleId = textValue(formData, "cycleId");
  const status = textValue(formData, "status");

  if (
    !cycleId ||
    !["draft", "open", "closed"].includes(status)
  ) {
    return { ok: false, message: "ข้อมูลรอบบิลไม่ครบ" };
  }

  const db = getDb();
  const organizationId = await getDefaultOrganizationId();

  if (status === "open") {
    await db
      .update(billingCycles)
      .set({ status: "closed" })
      .where(
        and(
          eq(billingCycles.organizationId, organizationId),
          eq(billingCycles.status, "open"),
        ),
      );
  }

  await db
    .update(billingCycles)
    .set({ status: status as "draft" | "open" | "closed" })
    .where(
      and(
        eq(billingCycles.organizationId, organizationId),
        eq(billingCycles.id, cycleId),
      ),
    );

  revalidatePath("/");
  return { ok: true, message: "อัปเดตรอบบิลแล้ว" };
}

const meterSchema = z.object({
  unitId: z.string().uuid(),
  tenantId: z.string().uuid().optional().or(z.literal("")),
  billingCycleId: z.string().uuid(),
  previousReading: z.number().min(0),
  currentReading: z.number().min(0),
  rate: z.number().min(0),
  cloudinaryPublicId: z.string().optional(),
  cloudinaryAssetId: z.string().optional(),
  cloudinarySecureUrl: z.string().optional(),
  cloudinaryVersion: z.number().optional(),
  imageWidth: z.number().optional(),
  imageHeight: z.number().optional(),
});

export async function recordMeterReadingAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const parsed = meterSchema.safeParse({
    unitId: textValue(formData, "unitId"),
    tenantId: textValue(formData, "tenantId"),
    billingCycleId: textValue(formData, "billingCycleId") || textValue(formData, "cycleId"),
    previousReading: numberValue(formData, "previousReading"),
    currentReading: numberValue(formData, "currentReading"),
    rate: numberValue(formData, "rate"),
    cloudinaryPublicId: textValue(formData, "cloudinaryPublicId"),
    cloudinaryAssetId: textValue(formData, "cloudinaryAssetId"),
    cloudinarySecureUrl: textValue(formData, "cloudinarySecureUrl"),
    cloudinaryVersion: numberValue(formData, "cloudinaryVersion") || undefined,
    imageWidth: numberValue(formData, "imageWidth") || undefined,
    imageHeight: numberValue(formData, "imageHeight") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลมิเตอร์ไม่ครบ" };
  }

  const { usageUnits, amount, warning } = calculateElectricityCharge(parsed.data);
  const db = getDb();
  const organizationId = await getDefaultOrganizationId();
  let tenantId = parsed.data.tenantId;

  if (!tenantId) {
    const [unit] = await db
      .select({ tenantId: rentalUnits.tenantId })
      .from(rentalUnits)
      .where(eq(rentalUnits.id, parsed.data.unitId))
      .limit(1);
    tenantId = unit?.tenantId ?? "";
  }

  if (!tenantId) {
    return { ok: false, message: "พื้นที่นี้ยังไม่ได้ผูกผู้เช่า" };
  }

  const [reading] = await db.insert(meterReadings).values({
    organizationId,
    unitId: parsed.data.unitId,
    tenantId,
    billingCycleId: parsed.data.billingCycleId,
    previousReading: parsed.data.previousReading,
    currentReading: parsed.data.currentReading,
    usageUnits,
    rateSatang: toSatang(parsed.data.rate),
    amountSatang: toSatang(amount),
    cloudinaryPublicId: parsed.data.cloudinaryPublicId ?? "",
    cloudinaryAssetId: parsed.data.cloudinaryAssetId ?? "",
    cloudinarySecureUrl: parsed.data.cloudinarySecureUrl ?? "",
    cloudinaryVersion: parsed.data.cloudinaryVersion,
    imageWidth: parsed.data.imageWidth,
    imageHeight: parsed.data.imageHeight,
    warning: warning ?? "",
    createdByUserId: user.appUserId,
  }).returning({ id: meterReadings.id });

  if (booleanValue(formData, "createInvoice")) {
    const [[tenant], [cycle], [countRow]] = await Promise.all([
      db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1),
      db
        .select()
        .from(billingCycles)
        .where(eq(billingCycles.id, parsed.data.billingCycleId))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)` })
        .from(invoices)
        .where(eq(invoices.organizationId, organizationId)),
    ]);
    const invoiceItem = {
      id: "new",
      type: "electricity" as InvoiceType,
      description: `ค่าไฟ ${usageUnits} หน่วย`,
      quantity: usageUnits,
      unitPrice: parsed.data.rate,
      amount,
    };
    const totals = calculateInvoiceTotals({
      items: [invoiceItem],
      vatEnabled: tenant?.vatEnabled ?? true,
      vatRate: 7,
    });
    const invoiceNo = nextRunningNo(
      invoicePrefixFromDate(new Date()),
      Number(countRow?.count ?? 0),
    );
    const [invoice] = await db
      .insert(invoices)
      .values({
        organizationId,
        tenantId,
        billingCycleId: parsed.data.billingCycleId,
        invoiceNo,
        type: "electricity",
        issueDate: new Date(),
        dueDate: cycle?.dueDate ?? new Date(),
        subtotalSatang: toSatang(totals.subtotal),
        discountSatang: 0,
        vatRateBasisPoints: totals.vatRate * 100,
        vatEnabled: tenant?.vatEnabled ?? true,
        vatAmountSatang: toSatang(totals.vatAmount),
        totalSatang: toSatang(totals.total),
        balanceSatang: toSatang(totals.balance),
        status: "issued",
        notes: warning ?? "",
      })
      .returning({ id: invoices.id });

    await db.insert(invoiceItems).values({
      invoiceId: invoice.id,
      meterReadingId: reading.id,
      type: "electricity",
      description: invoiceItem.description,
      quantity: invoiceItem.quantity,
      unitPriceSatang: toSatang(invoiceItem.unitPrice),
      amountSatang: toSatang(invoiceItem.amount),
    });
  }

  revalidatePath("/");
  return { ok: true, message: "บันทึกเลขมิเตอร์แล้ว" };
}

export async function createInvoiceForUnitAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  let tenantId = textValue(formData, "tenantId");
  const unitId = textValue(formData, "unitId");
  const billingCycleId = textValue(formData, "billingCycleId");
  const type: InvoiceType =
    textValue(formData, "type") === "electricity" ? "electricity" : "rent";
  const description = textValue(formData, "description");
  const quantity = Math.max(numberValue(formData, "quantity"), 1);
  const unitPrice =
    numberValue(formData, "unitPrice") || numberValue(formData, "rentAmount");
  const discount = numberValue(formData, "discount");
  const vatEnabled = booleanValue(formData, "vatEnabled");
  const dueDate = textValue(formData, "dueDate");

  const db = getDb();
  const organizationId = await getDefaultOrganizationId();

  if (!tenantId && unitId) {
    const [unit] = await db
      .select({ tenantId: rentalUnits.tenantId })
      .from(rentalUnits)
      .where(eq(rentalUnits.id, unitId))
      .limit(1);
    tenantId = unit?.tenantId ?? "";
  }

  if (!tenantId || !billingCycleId || !description || !dueDate) {
    return { ok: false, message: "ข้อมูลใบแจ้งหนี้ไม่ครบ" };
  }

  const item = {
    id: "new",
    type,
    description,
    quantity,
    unitPrice,
    amount: quantity * unitPrice,
  };
  const totals = calculateInvoiceTotals({
    items: [item],
    discount,
    vatEnabled,
  });
  const invoiceNo = nextRunningNo(
    invoicePrefixFromDate(new Date()),
    Number(
      (
        await db
          .select({ count: sql<number>`count(*)` })
          .from(invoices)
          .where(eq(invoices.organizationId, organizationId))
      )[0]?.count ?? 0,
    ),
  );

  const [invoice] = await db
    .insert(invoices)
    .values({
      organizationId,
      tenantId,
      billingCycleId,
      invoiceNo,
      type,
      issueDate: new Date(),
      dueDate: new Date(dueDate),
      subtotalSatang: toSatang(totals.subtotal),
      discountSatang: toSatang(totals.discount),
      vatRateBasisPoints: totals.vatRate * 100,
      vatEnabled,
      vatAmountSatang: toSatang(totals.vatAmount),
      totalSatang: toSatang(totals.total),
      balanceSatang: toSatang(totals.balance),
      status: "issued",
    })
    .returning({ id: invoices.id });

  await db.insert(invoiceItems).values({
    invoiceId: invoice.id,
    type,
    description,
    quantity,
    unitPriceSatang: toSatang(unitPrice),
    amountSatang: toSatang(item.amount),
  });

  revalidatePath("/");
  return { ok: true, message: "ออกใบแจ้งหนี้แล้ว" };
}

export async function generateBatchInvoicesAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const billingCycleId = textValue(formData, "billingCycleId");

  if (!billingCycleId) {
    return { ok: false, message: "ยังไม่ได้เลือกรอบบิล" };
  }

  const db = getDb();
  const organizationId = await getDefaultOrganizationId();
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const [cycle] = await db
    .select()
    .from(billingCycles)
    .where(
      and(
        eq(billingCycles.organizationId, organizationId),
        eq(billingCycles.id, billingCycleId),
      ),
    )
    .limit(1);

  if (!cycle) {
    return { ok: false, message: "ไม่พบรอบบิลนี้" };
  }

  if (cycle.status === "closed") {
    return { ok: false, message: "รอบบิลนี้ปิดแล้ว" };
  }

  const [
    unitRows,
    tenantRows,
    readingRows,
    existingInvoiceRows,
    countRow,
  ] = await Promise.all([
    db
      .select()
      .from(rentalUnits)
      .where(
        and(
          eq(rentalUnits.organizationId, organizationId),
          eq(rentalUnits.status, "occupied"),
        ),
      ),
    db.select().from(tenants).where(eq(tenants.organizationId, organizationId)),
    db
      .select()
      .from(meterReadings)
      .where(
        and(
          eq(meterReadings.organizationId, organizationId),
          eq(meterReadings.billingCycleId, billingCycleId),
        ),
      ),
    db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.billingCycleId, billingCycleId),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(eq(invoices.organizationId, organizationId)),
  ]);

  const tenantsById = new Map(tenantRows.map((tenant) => [tenant.id, tenant]));
  const latestReadingByUnit = new Map<string, (typeof readingRows)[number]>();
  const invoicedTenantIds = new Set(
    existingInvoiceRows.map((invoice) => invoice.tenantId),
  );
  let skippedExisting = 0;
  let skippedNoTenant = 0;
  let missingMeter = 0;
  let createdCount = 0;
  let runningCount = Number(countRow?.[0]?.count ?? 0);
  const prefix = invoicePrefixFromDate(cycle.periodStart);

  for (const reading of readingRows) {
    const current = latestReadingByUnit.get(reading.unitId);

    if (
      !current ||
      reading.capturedAt.getTime() > current.capturedAt.getTime()
    ) {
      latestReadingByUnit.set(reading.unitId, reading);
    }
  }

  for (const unit of unitRows) {
    if (!unit.tenantId) {
      skippedNoTenant += 1;
      continue;
    }

    if (invoicedTenantIds.has(unit.tenantId)) {
      skippedExisting += 1;
      continue;
    }

    const tenant = tenantsById.get(unit.tenantId);

    if (!tenant) {
      skippedNoTenant += 1;
      continue;
    }

    const reading = latestReadingByUnit.get(unit.id);
    const items: InvoiceItem[] = [
      {
        id: "rent",
        type: "rent",
        description: `ค่าเช่าพื้นที่ ${unit.code} รอบ ${cycle.label}`,
        quantity: 1,
        unitPrice: unit.rentAmountSatang / 100,
        amount: unit.rentAmountSatang / 100,
      },
    ];

    if (reading) {
      items.push({
        id: "electric",
        type: "electricity",
        description: `ค่าไฟพื้นที่ ${unit.code} ${reading.usageUnits} หน่วย`,
        quantity: reading.usageUnits,
        unitPrice: reading.rateSatang / 100,
        amount: reading.amountSatang / 100,
        meterReadingId: reading.id,
      });
    } else {
      missingMeter += 1;
    }

    const totals = calculateInvoiceTotals({
      items,
      vatEnabled: tenant.vatEnabled,
      vatRate: (organization?.vatRateBasisPoints ?? 700) / 100,
    });

    if (totals.total <= 0) {
      skippedNoTenant += 1;
      continue;
    }

    const invoiceNo = nextRunningNo(prefix, runningCount);
    runningCount += 1;

    const [invoice] = await db
      .insert(invoices)
      .values({
        organizationId,
        tenantId: tenant.id,
        billingCycleId,
        invoiceNo,
        type: reading ? "mixed" : "rent",
        issueDate: new Date(),
        dueDate: cycle.dueDate,
        subtotalSatang: toSatang(totals.subtotal),
        discountSatang: 0,
        vatRateBasisPoints: Math.round(totals.vatRate * 100),
        vatEnabled: tenant.vatEnabled,
        vatAmountSatang: toSatang(totals.vatAmount),
        totalSatang: toSatang(totals.total),
        balanceSatang: toSatang(totals.balance),
        status: "issued",
      })
      .returning({ id: invoices.id });

    await db.insert(invoiceItems).values(
      items.map((item) => ({
        invoiceId: invoice.id,
        meterReadingId: item.meterReadingId,
        type: item.type,
        description: item.description,
        quantity: item.quantity,
        unitPriceSatang: toSatang(item.unitPrice),
        amountSatang: toSatang(item.amount),
      })),
    );

    invoicedTenantIds.add(tenant.id);
    createdCount += 1;
  }

  revalidatePath("/");

  if (!createdCount) {
    return {
      ok: false,
      message: "ยังไม่มีรายการที่สร้างได้ในรอบบิลนี้",
    };
  }

  return {
    ok: true,
    message: `สร้างใบแจ้งหนี้ ${createdCount} ใบ ข้ามซ้ำ ${skippedExisting} ห้อง ไม่มีผู้เช่า ${skippedNoTenant} ห้อง ไม่มีเลขไฟ ${missingMeter} ห้อง`,
  };
}

export async function createTenantPortalLinkAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const tenantId = textValue(formData, "tenantId");
  if (!tenantId) return { ok: false, message: "ไม่พบผู้เช่า" };

  const link = await createPortalLinkForTenant(tenantId, user.appUserId);

  revalidatePath("/");
  return { ok: true, message: `สร้างลิงก์ผู้เช่าแล้ว: ${link.url}` };
}

export async function revokeTenantPortalLinkAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const linkId = textValue(formData, "linkId");
  if (!linkId) return { ok: false, message: "ไม่พบลิงก์" };

  await getDb()
    .update(tenantPortalLinks)
    .set({ active: false, revokedAt: new Date() })
    .where(eq(tenantPortalLinks.id, linkId));

  revalidatePath("/");
  return { ok: true, message: "ปิดลิงก์ผู้เช่าแล้ว" };
}

export async function sendInvoiceEmailAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const invoiceId = textValue(formData, "invoiceId");
  const db = getDb();
  const [[invoice], tenantRows] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1),
    db.select().from(tenants),
  ]);
  const tenant = tenantRows.find((item) => item.id === invoice?.tenantId);

  if (!invoice || !tenant) {
    return { ok: false, message: "ไม่พบใบแจ้งหนี้" };
  }

  const link = await createPortalLinkForTenant(tenant.id, user.appUserId);
  const invoiceUrl = `${link.url}/invoice/${invoice.id}`;

  if (!tenant.email) {
    revalidatePath("/");
    return {
      ok: true,
      message: `ผู้เช่ายังไม่มีอีเมล ใช้ลิงก์นี้แทน: ${invoiceUrl}`,
    };
  }

  if (!isResendConfigured()) {
    revalidatePath("/");
    return {
      ok: true,
      message: `ยังไม่ตั้งค่า Resend ส่งเมลไม่ได้ ใช้ลิงก์นี้แทน: ${invoiceUrl}`,
    };
  }

  const resend = getResend();
  const { error } = await resend.emails.send({
    from: getBillingEmailFrom(),
    to: tenant.email,
    subject: `ใบแจ้งหนี้ ${invoice.invoiceNo}`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.6">
        <h2>ใบแจ้งหนี้ ${invoice.invoiceNo}</h2>
        <p>เรียน ${tenant.name}</p>
        <p>กรุณาตรวจสอบใบแจ้งหนี้และชำระเงินผ่านลิงก์ด้านล่าง</p>
        <p><a href="${invoiceUrl}">เปิดใบแจ้งหนี้และชำระเงิน</a></p>
        <p>ยอดค้างชำระ ${(invoice.balanceSatang / 100).toLocaleString("th-TH", { style: "currency", currency: "THB" })}</p>
      </div>
    `,
  });

  if (error) {
    return { ok: false, message: error.message ?? "ส่งอีเมลไม่สำเร็จ" };
  }

  revalidatePath("/");
  return { ok: true, message: "ส่งอีเมลใบแจ้งหนี้แล้ว" };
}

export async function sendInvoiceReminderEmailAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const invoiceId = textValue(formData, "invoiceId");
  const db = getDb();
  const [[invoice], tenantRows] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1),
    db.select().from(tenants),
  ]);
  const tenant = tenantRows.find((item) => item.id === invoice?.tenantId);

  if (!invoice || !tenant) {
    return { ok: false, message: "ไม่พบใบแจ้งหนี้" };
  }

  if (invoice.balanceSatang <= 0 || invoice.status === "void") {
    return { ok: false, message: "ใบแจ้งหนี้นี้ไม่ต้องแจ้งเตือน" };
  }

  const link = await createPortalLinkForTenant(tenant.id, user.appUserId);
  const invoiceUrl = `${link.url}/invoice/${invoice.id}`;
  const isOverdue = invoice.dueDate.getTime() < Date.now();
  const subject = isOverdue
    ? `แจ้งเตือนยอดค้างชำระ ${invoice.invoiceNo}`
    : `แจ้งเตือนกำหนดชำระ ${invoice.invoiceNo}`;

  if (!tenant.email) {
    revalidatePath("/");
    return {
      ok: true,
      message: `ผู้เช่ายังไม่มีอีเมล ใช้ลิงก์นี้แทน: ${invoiceUrl}`,
    };
  }

  if (!isResendConfigured()) {
    revalidatePath("/");
    return {
      ok: true,
      message: `ยังไม่ตั้งค่า Resend ส่งเมลไม่ได้ ใช้ลิงก์นี้แทน: ${invoiceUrl}`,
    };
  }

  const { error } = await getResend().emails.send({
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
    return { ok: false, message: error.message ?? "ส่งอีเมลไม่สำเร็จ" };
  }

  await db.insert(invoiceAuditLogs).values({
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    actorUserId: user.appUserId,
    action: isOverdue ? "overdue_reminder_sent" : "due_reminder_sent",
    reason: "ส่งอีเมลแจ้งเตือนชำระเงิน",
  });

  revalidatePath("/");
  return { ok: true, message: "ส่งอีเมลแจ้งเตือนแล้ว" };
}

export async function sendReceiptEmailAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const paymentId = textValue(formData, "paymentId");
  const db = getDb();
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);

  if (!payment) return { ok: false, message: "ไม่พบใบเสร็จ" };

  const [[invoice], tenantRows] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).limit(1),
    db.select().from(tenants),
  ]);
  const tenant = tenantRows.find((item) => item.id === invoice?.tenantId);

  if (!invoice || !tenant) {
    return { ok: false, message: "ไม่พบข้อมูลใบเสร็จ" };
  }

  const link = await createPortalLinkForTenant(tenant.id, user.appUserId);
  const receiptUrl = `${link.url}/receipt/${payment.id}`;

  if (!tenant.email) {
    revalidatePath("/");
    return {
      ok: true,
      message: `ผู้เช่ายังไม่มีอีเมล ใช้ลิงก์นี้แทน: ${receiptUrl}`,
    };
  }

  if (!isResendConfigured()) {
    revalidatePath("/");
    return {
      ok: true,
      message: `ยังไม่ตั้งค่า Resend ส่งเมลไม่ได้ ใช้ลิงก์นี้แทน: ${receiptUrl}`,
    };
  }

  const { error } = await getResend().emails.send({
    from: getBillingEmailFrom(),
    to: tenant.email,
    subject: `ใบเสร็จ ${payment.receiptNo}`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.6">
        <h2>ใบเสร็จ ${payment.receiptNo}</h2>
        <p>เรียน ${tenant.name}</p>
        <p>ระบบบันทึกการชำระเงินสำหรับใบแจ้งหนี้ ${invoice.invoiceNo} แล้ว</p>
        <p>ยอดรับชำระ ${(payment.amountSatang / 100).toLocaleString("th-TH", { style: "currency", currency: "THB" })}</p>
        <p><a href="${receiptUrl}">เปิดใบเสร็จ</a></p>
      </div>
    `,
  });

  if (error) {
    return { ok: false, message: error.message ?? "ส่งอีเมลไม่สำเร็จ" };
  }

  await db.insert(invoiceAuditLogs).values({
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    actorUserId: user.appUserId,
    action: "receipt_email_sent",
    reason: payment.receiptNo,
  });

  revalidatePath("/");
  return { ok: true, message: "ส่งอีเมลใบเสร็จแล้ว" };
}

export async function recordPaymentAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const invoiceId = textValue(formData, "invoiceId");
  const amount = numberValue(formData, "amount");
  const paidAt = textValue(formData, "paidAt");

  if (!invoiceId || amount <= 0 || !paidAt) {
    return { ok: false, message: "ข้อมูลการชำระเงินไม่ครบ" };
  }

  const db = getDb();
  const organizationId = await getDefaultOrganizationId();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!invoice) {
    return { ok: false, message: "ไม่พบใบแจ้งหนี้" };
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(payments)
    .where(eq(payments.organizationId, organizationId));
  const receiptNo = nextRunningNo(
    receiptPrefixFromDate(new Date()),
    Number(countRow?.count ?? 0),
  );
  const paidSatang = invoice.paidSatang + toSatang(amount);
  const total = invoice.totalSatang / 100;
  const status = deriveInvoiceStatus({
    total,
    paid: paidSatang / 100,
    dueDate: invoice.dueDate.toISOString(),
    issued: true,
  });

  await db.insert(payments).values({
    organizationId,
    invoiceId,
    receiptNo,
    paidAt: new Date(paidAt),
    amountSatang: toSatang(amount),
    method: ["cash", "bank_transfer", "promptpay", "other"].includes(
      textValue(formData, "method"),
    )
      ? (textValue(formData, "method") as "cash" | "bank_transfer" | "promptpay" | "other")
      : "bank_transfer",
    provider: "manual",
    reference: textValue(formData, "reference"),
    notes: textValue(formData, "notes"),
    createdByUserId: user.appUserId,
  });

  await db
    .update(invoices)
    .set({
      paidSatang,
      balanceSatang: Math.max(invoice.totalSatang - paidSatang, 0),
      status,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId));

  revalidatePath("/");
  return { ok: true, message: "บันทึกชำระเงินแล้ว" };
}

export async function voidInvoiceAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const invoiceId = textValue(formData, "invoiceId");
  const reason = textValue(formData, "reason");

  if (!invoiceId || !reason) {
    return { ok: false, message: "กรุณาระบุเหตุผลยกเลิกใบแจ้งหนี้" };
  }

  const db = getDb();
  const organizationId = await getDefaultOrganizationId();

  await db
    .update(invoices)
    .set({
      status: "void",
      balanceSatang: 0,
      notes: reason,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId));

  await db.insert(invoiceAuditLogs).values({
    organizationId,
    invoiceId,
    actorUserId: user.appUserId,
    action: "void_invoice",
    reason,
  });

  revalidatePath("/");
  return { ok: true, message: "ยกเลิกใบแจ้งหนี้แล้ว" };
}

export async function voidPaymentAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const paymentId = textValue(formData, "paymentId");
  const reason = textValue(formData, "reason");

  if (!paymentId || !reason) {
    return { ok: false, message: "กรุณาระบุเหตุผลยกเลิกรับเงิน" };
  }

  const db = getDb();
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);

  if (!payment) return { ok: false, message: "ไม่พบรายการรับเงิน" };

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, payment.invoiceId))
    .limit(1);

  if (!invoice) return { ok: false, message: "ไม่พบใบแจ้งหนี้" };

  const paidSatang = Math.max(invoice.paidSatang - payment.amountSatang, 0);
  const balanceSatang = Math.max(invoice.totalSatang - paidSatang, 0);
  const status = deriveInvoiceStatus({
    total: invoice.totalSatang / 100,
    paid: paidSatang / 100,
    dueDate: invoice.dueDate.toISOString(),
    issued: true,
  });

  await db
    .update(payments)
    .set({
      refundStatus: payment.provider === "stripe" ? "requested" : "refunded",
      notes: [payment.notes, `ยกเลิก: ${reason}`].filter(Boolean).join("\n"),
    })
    .where(eq(payments.id, paymentId));

  await db
    .update(invoices)
    .set({
      paidSatang,
      balanceSatang,
      status,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id));

  await db.insert(invoiceAuditLogs).values({
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    actorUserId: user.appUserId,
    action: "void_payment",
    reason,
    metadata: payment.receiptNo,
  });

  revalidatePath("/");
  return { ok: true, message: "ยกเลิกรายการรับเงินแล้ว" };
}
