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
  hasMeterImage,
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

const manualInvoiceTypes = ["rent", "fuel_transport", "other"] as const;
const editableInvoiceTypes = [
  "rent",
  "electricity",
  "fuel_transport",
  "mixed",
  "other",
] as const;

function isManualInvoiceType(value: string): value is (typeof manualInvoiceTypes)[number] {
  return manualInvoiceTypes.includes(value as (typeof manualInvoiceTypes)[number]);
}

function isEditableInvoiceType(value: string): value is InvoiceType {
  return editableInvoiceTypes.includes(
    value as (typeof editableInvoiceTypes)[number],
  );
}

const fuelTripItemsSchema = z.array(
  z.object({
    date: z.string().optional(),
    label: z.string().optional(),
    quantity: z.coerce.number(),
    unitPrice: z.coerce.number(),
  }),
);

const editableInvoiceItemsSchema = z.array(
  z.object({
    type: z.string(),
    description: z.string(),
    quantity: z.coerce.number(),
    unitPrice: z.coerce.number(),
    meterReadingId: z.string().optional(),
  }),
);

function formatFuelTripDate(value?: string) {
  if (!value) return "";

  const date = toDateValue(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function parseFuelTripItems(value: string): ActionFailure | { ok: true; items: InvoiceItem[] } {
  if (!value) {
    return { ok: false, message: "ต้องเพิ่มรอบวิ่งอย่างน้อย 1 รายการ" };
  }

  let payload: unknown;

  try {
    payload = JSON.parse(value);
  } catch {
    return { ok: false, message: "รายการรอบวิ่งไม่ถูกต้อง" };
  }

  const parsed = fuelTripItemsSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, message: "รายการรอบวิ่งไม่ถูกต้อง" };
  }

  const items = parsed.data
    .map((trip, index): InvoiceItem => {
      const quantity = Math.max(Math.round(trip.quantity), 1);
      const unitPrice = Number.isFinite(trip.unitPrice) ? trip.unitPrice : 0;
      const tripLabel = trip.label?.trim() || `รอบวิ่ง ${index + 1}`;
      const tripDate = formatFuelTripDate(trip.date);
      const description = [
        "ค่าขนส่งน้ำมัน",
        tripLabel,
        tripDate,
      ].filter(Boolean).join(" ");

      return {
        id: `fuel-trip-${index + 1}`,
        type: "fuel_transport",
        description,
        quantity,
        unitPrice,
        amount: quantity * unitPrice,
      };
    })
    .filter((item) => item.unitPrice > 0);

  if (!items.length) {
    return { ok: false, message: "ต้องกรอกค่าเที่ยวอย่างน้อย 1 รอบวิ่ง" };
  }

  return { ok: true, items };
}

function parseEditableInvoiceItems(
  value: string,
): ActionFailure | { ok: true; items: InvoiceItem[] } {
  if (!value) {
    return { ok: false, message: "ต้องมีรายการในใบแจ้งหนี้อย่างน้อย 1 รายการ" };
  }

  let payload: unknown;

  try {
    payload = JSON.parse(value);
  } catch {
    return { ok: false, message: "รายการในใบแจ้งหนี้ไม่ถูกต้อง" };
  }

  const parsed = editableInvoiceItemsSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, message: "รายการในใบแจ้งหนี้ไม่ถูกต้อง" };
  }

  const items = parsed.data
    .map((item, index): InvoiceItem | null => {
      const type = isEditableInvoiceType(item.type) ? item.type : "other";
      const description = item.description.trim();
      const quantity = Math.max(Math.round(item.quantity), 1);
      const unitPrice = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;

      if (!description || unitPrice <= 0) return null;

      return {
        id: `edited-item-${index + 1}`,
        type,
        description,
        quantity,
        unitPrice,
        amount: quantity * unitPrice,
        meterReadingId: item.meterReadingId || undefined,
      };
    })
    .filter((item): item is InvoiceItem => Boolean(item));

  if (!items.length) {
    return { ok: false, message: "ต้องกรอกรายการและยอดเงินอย่างน้อย 1 รายการ" };
  }

  return { ok: true, items };
}

function inferInvoiceTypeFromItems(items: InvoiceItem[], fallback: InvoiceType): InvoiceType {
  const uniqueTypes = new Set(items.map((item) => item.type));
  if (uniqueTypes.size === 1) return items[0]?.type ?? fallback;
  return "mixed";
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

const sampleTenants = [
  {
    code: "BNT",
    name: "บริษัท บีเอ็นที เอ็กซ์เพรส จำกัด (สำนักงานใหญ่)",
    taxId: "0505562019812",
    billingAddress:
      "เลขที่ 8 หมู่ที่ 4 ตำบลหนองป่าครั่ง\nอำเภอเมืองเชียงใหม่ จังหวัดเชียงใหม่ 50000",
  },
  {
    code: "LAZADA",
    name: "บริษัท ลาซาด้า เอ็กซ์เพรส จำกัด (สำนักงานใหญ่)",
    taxId: "0-1055-58080-77-8",
    billingAddress:
      "689 อาคารภิรัช ชั้นที่ 29 ห้องเลขที่ 2904-2906 ซ.สุขุมวิท 35\nถ.สุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร 10110",
  },
  {
    code: "FLASH",
    name: "บริษัท แฟลช เอ็กซ์เพรส จำกัด สำนักงานใหญ่",
    taxId: "0105560159254",
    billingAddress:
      "เลขที่ 161 อาคารยูนิลีเวอร์ เฮ้าส์ ชั้นที่ 7 และ 8 ถนนพระรามเก้า\nแขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310",
  },
  {
    code: "TAIFAH",
    name: "หจก. ใต้ฟ้าปิโตรเลียม",
    taxId: "",
    billingAddress: "",
  },
  {
    code: "DAOPAISAAN",
    name: "ดาวไพศาล",
    taxId: "",
    billingAddress: "",
  },
] as const;

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

export async function importSampleTenantsAction(): Promise<ActionResult> {
  const user = await requireAdminAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const db = getDb();
  const organizationId = await getDefaultOrganizationId();
  const existingRows = await db
    .select({ code: tenants.code })
    .from(tenants)
    .where(eq(tenants.organizationId, organizationId));
  const existingCodes = new Set(existingRows.map((tenant) => tenant.code));
  const newTenants = sampleTenants.filter(
    (tenant) => !existingCodes.has(tenant.code),
  );

  if (!newTenants.length) {
    return { ok: true, message: "มีลูกค้าจากตัวอย่างครบแล้ว" };
  }

  await db.insert(tenants).values(
    newTenants.map((tenant) => ({
      organizationId,
      code: tenant.code,
      name: tenant.name,
      taxId: tenant.taxId,
      billingAddress: tenant.billingAddress,
      vatEnabled: true,
      status: "active" as const,
    })),
  );

  revalidatePath("/");
  return {
    ok: true,
    message: `เพิ่มลูกค้าจากตัวอย่าง ${newTenants.length} รายแล้ว`,
  };
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
      bankAccountName: textValue(formData, "bankAccountName"),
      bankAccountNumber: textValue(formData, "bankAccountNumber"),
      bankName: textValue(formData, "bankName"),
      bankBranch: textValue(formData, "bankBranch"),
      paymentLineId: textValue(formData, "paymentLineId"),
      promptpayId: textValue(formData, "promptpayId"),
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
  previousCloudinaryPublicId: z.string().optional(),
  previousCloudinaryAssetId: z.string().optional(),
  previousCloudinarySecureUrl: z.string().optional(),
  previousCloudinaryVersion: z.number().optional(),
  previousImageWidth: z.number().optional(),
  previousImageHeight: z.number().optional(),
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
    previousCloudinaryPublicId: textValue(formData, "previousCloudinaryPublicId"),
    previousCloudinaryAssetId: textValue(formData, "previousCloudinaryAssetId"),
    previousCloudinarySecureUrl: textValue(formData, "previousCloudinarySecureUrl"),
    previousCloudinaryVersion:
      numberValue(formData, "previousCloudinaryVersion") || undefined,
    previousImageWidth: numberValue(formData, "previousImageWidth") || undefined,
    previousImageHeight: numberValue(formData, "previousImageHeight") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลมิเตอร์ไม่ครบ" };
  }

  if (
    !parsed.data.cloudinaryPublicId ||
    !parsed.data.cloudinarySecureUrl?.startsWith("https://")
  ) {
    return { ok: false, message: "ต้องแนบรูปมิเตอร์ก่อนบันทึกเลขมิเตอร์" };
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
    previousCloudinaryPublicId: parsed.data.previousCloudinaryPublicId ?? "",
    previousCloudinaryAssetId: parsed.data.previousCloudinaryAssetId ?? "",
    previousCloudinarySecureUrl: parsed.data.previousCloudinarySecureUrl ?? "",
    previousCloudinaryVersion: parsed.data.previousCloudinaryVersion,
    previousImageWidth: parsed.data.previousImageWidth,
    previousImageHeight: parsed.data.previousImageHeight,
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
  const requestedType = textValue(formData, "type") || "rent";
  const description = textValue(formData, "description");
  const quantity = Math.max(Math.round(numberValue(formData, "quantity")), 1);
  const unitPrice =
    numberValue(formData, "unitPrice") || numberValue(formData, "rentAmount");
  const discount = numberValue(formData, "discount");
  const vatEnabled = booleanValue(formData, "vatEnabled");
  const dueDate = textValue(formData, "dueDate");
  const itemsJson = textValue(formData, "itemsJson");

  const db = getDb();
  const organizationId = await getDefaultOrganizationId();

  if (requestedType === "electricity") {
    return {
      ok: false,
      message: "ต้องบันทึกมิเตอร์พร้อมรูปก่อนออกใบแจ้งหนี้ค่าไฟ",
    };
  }

  if (!isManualInvoiceType(requestedType)) {
    return { ok: false, message: "ประเภทใบแจ้งหนี้ไม่ถูกต้อง" };
  }

  const type: InvoiceType = requestedType;

  if (!tenantId && unitId) {
    const [unit] = await db
      .select({ tenantId: rentalUnits.tenantId })
      .from(rentalUnits)
      .where(eq(rentalUnits.id, unitId))
      .limit(1);
    tenantId = unit?.tenantId ?? "";
  }

  if (
    !tenantId ||
    !billingCycleId ||
    !description ||
    !dueDate ||
    (type === "rent" && !unitId)
  ) {
    return { ok: false, message: "ข้อมูลใบแจ้งหนี้ไม่ครบ" };
  }

  let items: InvoiceItem[];

  if (type === "fuel_transport" && itemsJson) {
    const parsedItems = parseFuelTripItems(itemsJson);
    if (!parsedItems.ok) return parsedItems;
    items = parsedItems.items;
  } else {
    if (unitPrice <= 0) {
      return { ok: false, message: "ข้อมูลใบแจ้งหนี้ไม่ครบ" };
    }

    items = [
      {
        id: "new",
        type,
        description,
        quantity,
        unitPrice,
        amount: quantity * unitPrice,
      },
    ];
  }

  const totals = calculateInvoiceTotals({
    items,
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
      notes: type === "fuel_transport" ? description : "",
    })
    .returning({ id: invoices.id });

  await db.insert(invoiceItems).values(
    items.map((item) => ({
      invoiceId: invoice.id,
      type: item.type,
      description: item.description,
      quantity: item.quantity,
      unitPriceSatang: toSatang(item.unitPrice),
      amountSatang: toSatang(item.amount),
    })),
  );

  revalidatePath("/");
  return { ok: true, message: "ออกใบแจ้งหนี้แล้ว" };
}

export async function updateInvoiceAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const invoiceId = textValue(formData, "invoiceId");
  const tenantId = textValue(formData, "tenantId");
  const dueDate = textValue(formData, "dueDate");
  const discount = numberValue(formData, "discount");
  const vatEnabled = booleanValue(formData, "vatEnabled");
  const notes = textValue(formData, "notes");
  const parsedItems = parseEditableInvoiceItems(textValue(formData, "itemsJson"));

  if (!invoiceId || !tenantId || !dueDate) {
    return { ok: false, message: "ข้อมูลใบแจ้งหนี้ไม่ครบ" };
  }

  if (!parsedItems.ok) return parsedItems;

  const db = getDb();
  const organizationId = await getDefaultOrganizationId();
  const [[invoice], [tenant]] = await Promise.all([
    db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.organizationId, organizationId),
        ),
      )
      .limit(1),
    db
      .select({ id: tenants.id })
      .from(tenants)
      .where(and(eq(tenants.id, tenantId), eq(tenants.organizationId, organizationId)))
      .limit(1),
  ]);

  if (!invoice) {
    return { ok: false, message: "ไม่พบใบแจ้งหนี้" };
  }

  if (!tenant) {
    return { ok: false, message: "ไม่พบผู้เช่า" };
  }

  if (invoice.status === "void") {
    return { ok: false, message: "ใบแจ้งหนี้ที่ยกเลิกแล้วแก้ไขไม่ได้" };
  }

  const totals = calculateInvoiceTotals({
    items: parsedItems.items,
    discount,
    vatEnabled,
  });
  const paid = invoice.paidSatang / 100;
  const newDueDate = toDateValue(dueDate);
  const status = deriveInvoiceStatus({
    total: totals.total,
    paid,
    dueDate: newDueDate.toISOString(),
    issued: true,
  });
  const nextType = inferInvoiceTypeFromItems(parsedItems.items, invoice.type);

  await db
    .update(invoices)
    .set({
      tenantId,
      type: nextType,
      dueDate: newDueDate,
      subtotalSatang: toSatang(totals.subtotal),
      discountSatang: toSatang(totals.discount),
      vatRateBasisPoints: totals.vatRate * 100,
      vatEnabled,
      vatAmountSatang: toSatang(totals.vatAmount),
      totalSatang: toSatang(totals.total),
      balanceSatang: Math.max(toSatang(totals.total) - invoice.paidSatang, 0),
      status,
      notes,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId));

  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  await db.insert(invoiceItems).values(
    parsedItems.items.map((item) => ({
      invoiceId,
      meterReadingId: item.meterReadingId,
      type: item.type,
      description: item.description,
      quantity: item.quantity,
      unitPriceSatang: toSatang(item.unitPrice),
      amountSatang: toSatang(item.amount),
    })),
  );

  await db.insert(invoiceAuditLogs).values({
    organizationId,
    invoiceId,
    actorUserId: user.appUserId,
    action: "update_invoice",
    reason: "แก้ไขใบแจ้งหนี้",
  });

  revalidatePath("/");
  revalidatePath(`/print/invoice/${invoiceId}`);
  return { ok: true, message: "แก้ไขใบแจ้งหนี้แล้ว" };
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
  let missingMeterImage = 0;
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
    if (!reading) {
      missingMeter += 1;
      continue;
    }

    if (!hasMeterImage(reading)) {
      missingMeterImage += 1;
      continue;
    }

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

    items.push({
      id: "electric",
      type: "electricity",
      description: `ค่าไฟพื้นที่ ${unit.code} ${reading.usageUnits} หน่วย`,
      quantity: reading.usageUnits,
      unitPrice: reading.rateSatang / 100,
      amount: reading.amountSatang / 100,
      meterReadingId: reading.id,
    });

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
        type: "mixed",
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
      message: `ยังไม่มีรายการที่สร้างได้ในรอบบิลนี้ ไม่มีเลขไฟ ${missingMeter} ห้อง ไม่มีรูปมิเตอร์ ${missingMeterImage} ห้อง`,
    };
  }

  return {
    ok: true,
    message: `สร้างใบแจ้งหนี้ ${createdCount} ใบ ข้ามซ้ำ ${skippedExisting} ห้อง ไม่มีผู้เช่า ${skippedNoTenant} ห้อง ไม่มีเลขไฟ ${missingMeter} ห้อง ไม่มีรูปมิเตอร์ ${missingMeterImage} ห้อง`,
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
      message: `ใช้โหมดส่งลิงก์เอง: ${invoiceUrl}`,
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
      message: `ใช้โหมดส่งลิงก์เอง: ${invoiceUrl}`,
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
      message: `ใช้โหมดส่งลิงก์เอง: ${receiptUrl}`,
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

export async function updateMeterReadingAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const meterReadingId = textValue(formData, "meterReadingId");
  const previousReading = numberValue(formData, "previousReading");
  const currentReading = numberValue(formData, "currentReading");
  const rate = numberValue(formData, "rate");
  const cloudinaryPublicId = textValue(formData, "cloudinaryPublicId");
  const cloudinaryAssetId = textValue(formData, "cloudinaryAssetId");
  const cloudinarySecureUrl = textValue(formData, "cloudinarySecureUrl");
  const cloudinaryVersion = numberValue(formData, "cloudinaryVersion") || undefined;
  const imageWidth = numberValue(formData, "imageWidth") || undefined;
  const imageHeight = numberValue(formData, "imageHeight") || undefined;

  if (!meterReadingId) {
    return { ok: false, message: "ไม่พบข้อมูลการอ่านมิเตอร์" };
  }

  const db = getDb();
  const organizationId = await getDefaultOrganizationId();

  // 1. Fetch existing reading
  const [existingReading] = await db
    .select()
    .from(meterReadings)
    .where(and(eq(meterReadings.id, meterReadingId), eq(meterReadings.organizationId, organizationId)))
    .limit(1);

  if (!existingReading) {
    return { ok: false, message: "ไม่พบข้อมูลมิเตอร์ที่ต้องการแก้ไข" };
  }

  // 2. Calculate electricity charge
  const { usageUnits, amount, warning } = calculateElectricityCharge({
    previousReading,
    currentReading,
    rate,
  });

  // 3. Update meter reading row
  const updateData: Record<string, unknown> = {
    previousReading,
    currentReading,
    usageUnits,
    rateSatang: toSatang(rate),
    amountSatang: toSatang(amount),
    warning: warning ?? "",
  };

  // Only update image details if new image is uploaded
  if (cloudinaryPublicId && cloudinarySecureUrl) {
    updateData.cloudinaryPublicId = cloudinaryPublicId;
    updateData.cloudinaryAssetId = cloudinaryAssetId ?? "";
    updateData.cloudinarySecureUrl = cloudinarySecureUrl;
    updateData.cloudinaryVersion = cloudinaryVersion;
    updateData.imageWidth = imageWidth;
    updateData.imageHeight = imageHeight;
  }

  await db
    .update(meterReadings)
    .set(updateData)
    .where(eq(meterReadings.id, meterReadingId));

  // 4. Find all invoice items pointing to this meterReadingId
  const linkedItems = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.meterReadingId, meterReadingId));

  // 5. Update linked invoices
  for (const item of linkedItems) {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, item.invoiceId), eq(invoices.organizationId, organizationId)))
      .limit(1);

    if (invoice && invoice.status !== "void" && invoice.status !== "paid") {
      // 5.1. Update the invoice item details
      await db
        .update(invoiceItems)
        .set({
          description: `ค่าไฟ ${usageUnits} หน่วย`,
          quantity: usageUnits,
          unitPriceSatang: toSatang(rate),
          amountSatang: toSatang(amount),
        })
        .where(eq(invoiceItems.id, item.id));

      // 5.2. Fetch all current items for this invoice to recalculate totals
      const currentInvoiceItems = await db
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, invoice.id));

      const formattedItems: InvoiceItem[] = currentInvoiceItems.map((itm) => ({
        id: itm.id,
        type: itm.type,
        description: itm.description,
        quantity: itm.quantity,
        unitPrice: itm.unitPriceSatang / 100,
        amount: itm.amountSatang / 100,
        meterReadingId: itm.meterReadingId ?? undefined,
      }));

      const totals = calculateInvoiceTotals({
        items: formattedItems,
        discount: invoice.discountSatang / 100,
        vatEnabled: invoice.vatEnabled,
        vatRate: invoice.vatRateBasisPoints / 100,
      });

      const nextStatus = deriveInvoiceStatus({
        total: totals.total,
        paid: invoice.paidSatang / 100,
        dueDate: invoice.dueDate.toISOString(),
        issued: true,
      });

      await db
        .update(invoices)
        .set({
          subtotalSatang: toSatang(totals.subtotal),
          vatAmountSatang: toSatang(totals.vatAmount),
          totalSatang: toSatang(totals.total),
          balanceSatang: Math.max(toSatang(totals.total) - invoice.paidSatang, 0),
          status: nextStatus,
          notes: warning ?? "",
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));

      await db.insert(invoiceAuditLogs).values({
        organizationId,
        invoiceId: invoice.id,
        actorUserId: user.appUserId,
        action: "update_invoice_via_meter",
        reason: "อัปเดตยอดเงินตามเลขมิเตอร์ที่แก้ไข",
      });

      revalidatePath(`/print/invoice/${invoice.id}`);
    }
  }

  revalidatePath("/");
  return { ok: true, message: "แก้ไขเลขมิเตอร์และปรับปรุงใบแจ้งหนี้ที่เกี่ยวข้องแล้ว" };
}

export async function deleteMeterReadingAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireStaffAction();
  if (!user.ok) return user;

  const databaseError = requireDatabase();
  if (databaseError) return databaseError;

  const meterReadingId = textValue(formData, "meterReadingId");

  if (!meterReadingId) {
    return { ok: false, message: "ไม่พบข้อมูลการอ่านมิเตอร์" };
  }

  const db = getDb();
  const organizationId = await getDefaultOrganizationId();

  // 1. Fetch reading
  const [reading] = await db
    .select()
    .from(meterReadings)
    .where(and(eq(meterReadings.id, meterReadingId), eq(meterReadings.organizationId, organizationId)))
    .limit(1);

  if (!reading) {
    return { ok: false, message: "ไม่พบข้อมูลมิเตอร์ที่ต้องการลบ" };
  }

  // 2. Check if linked to active non-void invoices
  const linkedItems = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.meterReadingId, meterReadingId));

  for (const item of linkedItems) {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, item.invoiceId), eq(invoices.organizationId, organizationId)))
      .limit(1);

    if (invoice && invoice.status !== "void") {
      if (invoice.status === "paid" || invoice.status === "partial") {
        return {
          ok: false,
          message: `ไม่สามารถลบได้ เนื่องจากมีการชำระเงินในใบแจ้งหนี้ ${invoice.invoiceNo} แล้ว`,
        };
      }
      
      const allItems = await db
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, invoice.id));

      if (allItems.length <= 1) {
        if (invoice.status === "draft") {
          await db.delete(invoices).where(eq(invoices.id, invoice.id));
        } else {
          await db
            .update(invoices)
            .set({ status: "void", balanceSatang: 0, updatedAt: new Date() })
            .where(eq(invoices.id, invoice.id));
          
          await db.insert(invoiceAuditLogs).values({
            organizationId,
            invoiceId: invoice.id,
            actorUserId: user.appUserId,
            action: "void_invoice_via_meter_delete",
            reason: "ยกเลิกใบแจ้งหนี้อัตโนมัติเนื่องจากลบเลขมิเตอร์ต้นทาง",
          });
        }
      } else {
        await db.delete(invoiceItems).where(eq(invoiceItems.id, item.id));

        const remainingItems = allItems.filter((itm) => itm.id !== item.id);
        const formattedItems: InvoiceItem[] = remainingItems.map((itm) => ({
          id: itm.id,
          type: itm.type,
          description: itm.description,
          quantity: itm.quantity,
          unitPrice: itm.unitPriceSatang / 100,
          amount: itm.amountSatang / 100,
          meterReadingId: itm.meterReadingId ?? undefined,
        }));

        const totals = calculateInvoiceTotals({
          items: formattedItems,
          discount: invoice.discountSatang / 100,
          vatEnabled: invoice.vatEnabled,
          vatRate: invoice.vatRateBasisPoints / 100,
        });

        const nextStatus = deriveInvoiceStatus({
          total: totals.total,
          paid: invoice.paidSatang / 100,
          dueDate: invoice.dueDate.toISOString(),
          issued: true,
        });

        await db
          .update(invoices)
          .set({
            subtotalSatang: toSatang(totals.subtotal),
            vatAmountSatang: toSatang(totals.vatAmount),
            totalSatang: toSatang(totals.total),
            balanceSatang: Math.max(toSatang(totals.total) - invoice.paidSatang, 0),
            status: nextStatus,
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, invoice.id));

        await db.insert(invoiceAuditLogs).values({
          organizationId,
          invoiceId: invoice.id,
          actorUserId: user.appUserId,
          action: "delete_item_via_meter_delete",
          reason: "ลบรายการค่าไฟเนื่องจากลบเลขมิเตอร์ต้นทาง และปรับยอดรวมใหม่",
        });
      }
      
      revalidatePath(`/print/invoice/${invoice.id}`);
    }
  }

  // 3. Delete the meter reading row
  await db
    .delete(meterReadings)
    .where(and(eq(meterReadings.id, meterReadingId), eq(meterReadings.organizationId, organizationId)));

  revalidatePath("/");
  return { ok: true, message: "ลบเลขมิเตอร์และปรับปรุงใบแจ้งหนี้ที่เกี่ยวข้องแล้ว" };
}
