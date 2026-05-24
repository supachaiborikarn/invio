import { asc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db";
import {
  appUsers,
  billingCycles,
  invoiceItems,
  invoices,
  meterReadings,
  organizations,
  payments,
  rentalUnits,
  tenants,
} from "@/db/schema";
import { fromSatang } from "@/lib/billing";
import { demoDashboardData } from "@/lib/demo-data";
import type {
  DashboardData,
  Invoice,
  InvoiceItem,
  MeterReading,
  Payment,
  RentalUnit,
  Tenant,
} from "@/lib/types";

function iso(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : value;
}

export function isCloudinaryConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

export function isClerkConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.CLERK_SECRET_KEY,
  );
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!hasDatabase()) {
    return {
      ...demoDashboardData,
      cloudinaryConfigured: isCloudinaryConfigured(),
      clerkConfigured: isClerkConfigured(),
    };
  }

  const db = getDb();
  const [organization] = await db.select().from(organizations).limit(1);

  if (!organization) {
    return {
      ...demoDashboardData,
      databaseConfigured: true,
      cloudinaryConfigured: isCloudinaryConfigured(),
      clerkConfigured: isClerkConfigured(),
    };
  }

  const [
    userRows,
    tenantRows,
    unitRows,
    cycleRows,
    readingRows,
    invoiceRows,
    itemRows,
    paymentRows,
  ] = await Promise.all([
    db
      .select()
      .from(appUsers)
      .where(eq(appUsers.organizationId, organization.id))
      .orderBy(asc(appUsers.createdAt)),
    db
      .select()
      .from(tenants)
      .where(eq(tenants.organizationId, organization.id))
      .orderBy(asc(tenants.code)),
    db
      .select()
      .from(rentalUnits)
      .where(eq(rentalUnits.organizationId, organization.id))
      .orderBy(asc(rentalUnits.code)),
    db
      .select()
      .from(billingCycles)
      .where(eq(billingCycles.organizationId, organization.id))
      .orderBy(asc(billingCycles.periodStart)),
    db
      .select()
      .from(meterReadings)
      .where(eq(meterReadings.organizationId, organization.id))
      .orderBy(asc(meterReadings.capturedAt)),
    db
      .select()
      .from(invoices)
      .where(eq(invoices.organizationId, organization.id))
      .orderBy(asc(invoices.issueDate)),
    db.select().from(invoiceItems),
    db
      .select()
      .from(payments)
      .where(eq(payments.organizationId, organization.id))
      .orderBy(asc(payments.paidAt)),
  ]);

  const tenantsData: Tenant[] = tenantRows.map((tenant) => ({
    id: tenant.id,
    code: tenant.code,
    name: tenant.name,
    contactName: tenant.contactName,
    taxId: tenant.taxId,
    phone: tenant.phone,
    email: tenant.email,
    billingAddress: tenant.billingAddress,
    vatEnabled: tenant.vatEnabled,
    status: tenant.status,
    notes: tenant.notes,
  }));

  const unitsData: RentalUnit[] = unitRows.map((unit) => ({
    id: unit.id,
    code: unit.code,
    name: unit.name,
    tenantId: unit.tenantId ?? "",
    rentAmount: fromSatang(unit.rentAmountSatang),
    electricRate: fromSatang(unit.electricRateSatang),
    meterSerial: unit.meterSerial,
    status: unit.status,
  }));

  const readingsData: MeterReading[] = readingRows.map((reading) => ({
    id: reading.id,
    unitId: reading.unitId,
    tenantId: reading.tenantId,
    cycleId: reading.billingCycleId,
    previousReading: reading.previousReading,
    currentReading: reading.currentReading,
    usageUnits: reading.usageUnits,
    rate: fromSatang(reading.rateSatang),
    amount: fromSatang(reading.amountSatang),
    capturedAt: iso(reading.capturedAt),
    imageUrl: reading.cloudinarySecureUrl,
    cloudinaryPublicId: reading.cloudinaryPublicId,
    cloudinaryAssetId: reading.cloudinaryAssetId,
    cloudinaryVersion: reading.cloudinaryVersion ?? undefined,
    warning: reading.warning || undefined,
  }));

  const itemsByInvoice = itemRows.reduce<Record<string, InvoiceItem[]>>(
    (acc, item) => {
      const invoiceItemsForRow = acc[item.invoiceId] ?? [];
      invoiceItemsForRow.push({
        id: item.id,
        type: item.type,
        description: item.description,
        quantity: item.quantity,
        unitPrice: fromSatang(item.unitPriceSatang),
        amount: fromSatang(item.amountSatang),
        meterReadingId: item.meterReadingId ?? undefined,
      });
      acc[item.invoiceId] = invoiceItemsForRow;
      return acc;
    },
    {},
  );

  const invoicesData: Invoice[] = invoiceRows.map((invoice) => ({
    id: invoice.id,
    tenantId: invoice.tenantId,
    cycleId: invoice.billingCycleId,
    invoiceNo: invoice.invoiceNo,
    type: invoice.type,
    issueDate: iso(invoice.issueDate),
    dueDate: iso(invoice.dueDate),
    items: itemsByInvoice[invoice.id] ?? [],
    subtotal: fromSatang(invoice.subtotalSatang),
    discount: fromSatang(invoice.discountSatang),
    vatRate: invoice.vatRateBasisPoints / 100,
    vatEnabled: invoice.vatEnabled,
    vatAmount: fromSatang(invoice.vatAmountSatang),
    total: fromSatang(invoice.totalSatang),
    paid: fromSatang(invoice.paidSatang),
    balance: fromSatang(invoice.balanceSatang),
    status: invoice.status,
    notes: invoice.notes,
  }));

  const paymentsData: Payment[] = paymentRows.map((payment) => ({
    id: payment.id,
    invoiceId: payment.invoiceId,
    receiptNo: payment.receiptNo,
    paidAt: iso(payment.paidAt),
    amount: fromSatang(payment.amountSatang),
    method: payment.method,
    reference: payment.reference,
    notes: payment.notes,
  }));

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      taxId: organization.taxId,
      address: organization.address,
      phone: organization.phone,
      email: organization.email,
      vatRate: organization.vatRateBasisPoints / 100,
      vatEnabledDefault: organization.vatEnabledDefault,
    },
    users: userRows.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    })),
    tenants: tenantsData,
    units: unitsData,
    cycles: cycleRows.map((cycle) => ({
      id: cycle.id,
      label: cycle.label,
      periodStart: iso(cycle.periodStart),
      periodEnd: iso(cycle.periodEnd),
      dueDate: iso(cycle.dueDate),
      status: cycle.status,
    })),
    meterReadings: readingsData,
    invoices: invoicesData,
    payments: paymentsData,
    databaseConfigured: true,
    cloudinaryConfigured: isCloudinaryConfigured(),
    clerkConfigured: isClerkConfigured(),
  };
}

export async function getInvoiceDocument(id: string) {
  const data = await getDashboardData();
  const invoice = data.invoices.find((item) => item.id === id);
  const tenant = invoice
    ? data.tenants.find((item) => item.id === invoice.tenantId)
    : undefined;
  const cycle = invoice
    ? data.cycles.find((item) => item.id === invoice.cycleId)
    : undefined;

  return { data, invoice, tenant, cycle };
}

export async function getReceiptDocument(id: string) {
  const data = await getDashboardData();
  const payment = data.payments.find((item) => item.id === id);
  const invoice = payment
    ? data.invoices.find((item) => item.id === payment.invoiceId)
    : undefined;
  const tenant = invoice
    ? data.tenants.find((item) => item.id === invoice.tenantId)
    : undefined;

  return { data, payment, invoice, tenant };
}
