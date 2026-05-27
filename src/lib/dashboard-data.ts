import { asc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db";
import {
  appUsers,
  billingCycles,
  invoiceAuditLogs,
  invoiceItems,
  invoices,
  meterReadings,
  organizations,
  paymentEvents,
  paymentSessions,
  payments,
  rentalUnits,
  tenantPortalLinks,
  tenants,
} from "@/db/schema";
import { fromSatang, hasMeterImage } from "@/lib/billing";
import { createSignedImageUrl } from "@/lib/cloudinary";
import { demoDashboardData } from "@/lib/demo-data";
import { hashPortalToken } from "@/lib/portal";
import type {
  DashboardData,
  InvoiceAuditLog,
  Invoice,
  InvoiceItem,
  MeterReading,
  Payment,
  PaymentEvent,
  PaymentSession,
  RentalUnit,
  TenantPortalLink,
  Tenant,
} from "@/lib/types";

function iso(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : value;
}

export function isCloudinaryConfigured() {
  return Boolean(
    (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
      process.env.CLOUDINARY_CLOUD_NAME) &&
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

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function isStripeWebhookConfigured() {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.BILLING_EMAIL_FROM);
}

export function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
}

function withRuntimeFlags(data: DashboardData): DashboardData {
  return {
    ...data,
    cloudinaryConfigured: isCloudinaryConfigured(),
    clerkConfigured: isClerkConfigured(),
    stripeConfigured: isStripeConfigured(),
    resendConfigured: isResendConfigured(),
    appUrl: getAppUrl(),
  };
}

export type InvoiceMeterEvidence = {
  id: string;
  title: string;
  imageUrl?: string;
  previousImageUrl?: string;
  unitCode: string;
  unitName: string;
  meterSerial: string;
  previousReading: number;
  currentReading: number;
  usageUnits: number;
  previousCapturedAt?: string;
  capturedAt: string;
  warning?: string;
};

export function getMeterImageUrl(reading: MeterReading) {
  if (!hasMeterImage(reading)) return undefined;

  if (
    isCloudinaryConfigured() &&
    reading.cloudinaryPublicId &&
    !reading.cloudinaryPublicId.startsWith("demo/")
  ) {
    return createSignedImageUrl(
      reading.cloudinaryPublicId,
      reading.cloudinaryVersion,
    );
  }

  return reading.imageUrl || undefined;
}

export function getInvoiceMeterEvidence(
  data: DashboardData,
  invoice: Invoice,
): InvoiceMeterEvidence[] {
  const readingsById = new Map(data.meterReadings.map((reading) => [reading.id, reading]));
  const unitsById = new Map(data.units.map((unit) => [unit.id, unit]));
  const previousReadingsByUnit = new Map<string, MeterReading[]>();
  const seenReadingIds = new Set<string>();
  const newestFirst = (a: MeterReading, b: MeterReading) =>
    new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime();

  for (const reading of data.meterReadings) {
    const list = previousReadingsByUnit.get(reading.unitId) ?? [];
    list.push(reading);
    previousReadingsByUnit.set(reading.unitId, list);
  }

  return invoice.items.flatMap((item) => {
    if (!item.meterReadingId || seenReadingIds.has(item.meterReadingId)) {
      return [];
    }

    const reading = readingsById.get(item.meterReadingId);
    if (!reading) return [];

    seenReadingIds.add(reading.id);
    const unit = unitsById.get(reading.unitId);
    const previousCandidates = (previousReadingsByUnit.get(reading.unitId) ?? [])
      .filter(
        (candidate) =>
          candidate.id !== reading.id &&
          candidate.currentReading === reading.previousReading,
      );
    const previousReading = [...previousCandidates].sort(newestFirst)[0];
    const previousImageReading = previousCandidates
      .filter(hasMeterImage)
      .sort((a, b) => {
        const actualReadingScore =
          Number(b.usageUnits > 0) - Number(a.usageUnits > 0);

        return actualReadingScore || newestFirst(a, b);
      })[0];

    return [
      {
        id: reading.id,
        title: item.description,
        imageUrl: getMeterImageUrl(reading),
        previousImageUrl: previousImageReading
          ? getMeterImageUrl(previousImageReading)
          : undefined,
        unitCode: unit?.code ?? "",
        unitName: unit?.name ?? "",
        meterSerial: unit?.meterSerial ?? "",
        previousReading: reading.previousReading,
        currentReading: reading.currentReading,
        usageUnits: reading.usageUnits,
        previousCapturedAt: previousReading?.capturedAt,
        capturedAt: reading.capturedAt,
        warning: reading.warning,
      },
    ];
  });
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!hasDatabase()) {
    return withRuntimeFlags(demoDashboardData);
  }

  const db = getDb();
  const [organization] = await db.select().from(organizations).limit(1);

  if (!organization) {
    return withRuntimeFlags({
      ...demoDashboardData,
      databaseConfigured: true,
    });
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
    portalLinkRows,
    sessionRows,
    eventRows,
    auditRows,
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
    db
      .select()
      .from(tenantPortalLinks)
      .where(eq(tenantPortalLinks.organizationId, organization.id))
      .orderBy(asc(tenantPortalLinks.createdAt)),
    db
      .select()
      .from(paymentSessions)
      .where(eq(paymentSessions.organizationId, organization.id))
      .orderBy(asc(paymentSessions.createdAt)),
    db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.organizationId, organization.id))
      .orderBy(asc(paymentEvents.receivedAt)),
    db
      .select()
      .from(invoiceAuditLogs)
      .where(eq(invoiceAuditLogs.organizationId, organization.id))
      .orderBy(asc(invoiceAuditLogs.createdAt)),
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
    provider: payment.provider,
    providerSessionId: payment.providerSessionId,
    providerPaymentId: payment.providerPaymentId,
    webhookEventId: payment.webhookEventId,
    refundStatus: payment.refundStatus,
    reference: payment.reference,
    notes: payment.notes,
  }));

  const portalLinksData: TenantPortalLink[] = portalLinkRows.map((link) => ({
    id: link.id,
    tenantId: link.tenantId,
    label: link.label,
    active: link.active,
    expiresAt: link.expiresAt ? iso(link.expiresAt) : undefined,
    lastViewedAt: link.lastViewedAt ? iso(link.lastViewedAt) : undefined,
    revokedAt: link.revokedAt ? iso(link.revokedAt) : undefined,
    createdAt: iso(link.createdAt),
  }));

  const paymentSessionsData: PaymentSession[] = sessionRows.map((session) => ({
    id: session.id,
    invoiceId: session.invoiceId,
    tenantId: session.tenantId,
    provider: session.provider,
    status: session.status,
    amount: fromSatang(session.amountSatang),
    currency: session.currency,
    providerSessionId: session.providerSessionId,
    providerPaymentId: session.providerPaymentId,
    checkoutUrl: session.checkoutUrl,
    expiresAt: session.expiresAt ? iso(session.expiresAt) : undefined,
    createdAt: iso(session.createdAt),
    updatedAt: iso(session.updatedAt),
  }));

  const paymentEventsData: PaymentEvent[] = eventRows.map((event) => ({
    id: event.id,
    provider: event.provider,
    eventId: event.eventId,
    eventType: event.eventType,
    providerSessionId: event.providerSessionId,
    providerPaymentId: event.providerPaymentId,
    receivedAt: iso(event.receivedAt),
  }));

  const invoiceAuditLogsData: InvoiceAuditLog[] = auditRows.map((log) => ({
    id: log.id,
    invoiceId: log.invoiceId,
    actorUserId: log.actorUserId ?? undefined,
    action: log.action,
    reason: log.reason,
    metadata: log.metadata,
    createdAt: iso(log.createdAt),
  }));

  return withRuntimeFlags({
    organization: {
      id: organization.id,
      name: organization.name,
      taxId: organization.taxId,
      address: organization.address,
      phone: organization.phone,
      email: organization.email,
      bankAccountName: organization.bankAccountName,
      bankAccountNumber: organization.bankAccountNumber,
      bankName: organization.bankName,
      bankBranch: organization.bankBranch,
      paymentLineId: organization.paymentLineId,
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
    portalLinks: portalLinksData,
    paymentSessions: paymentSessionsData,
    paymentEvents: paymentEventsData,
    invoiceAuditLogs: invoiceAuditLogsData,
    databaseConfigured: true,
    cloudinaryConfigured: isCloudinaryConfigured(),
    clerkConfigured: isClerkConfigured(),
    stripeConfigured: isStripeConfigured(),
    resendConfigured: isResendConfigured(),
    appUrl: getAppUrl(),
  });
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

export async function getTenantPortalData(token: string) {
  const demoPortal = () => {
    if (!["demo", "demo-tenant-a", "tenant-a"].includes(token)) return null;

    const data = withRuntimeFlags(demoDashboardData);
    const tenant = data.tenants[0];
    const invoicesForTenant = data.invoices.filter(
      (invoice) => invoice.tenantId === tenant.id,
    );
    const invoiceIds = new Set(invoicesForTenant.map((invoice) => invoice.id));

    return {
      data,
      token,
      tenant,
      invoices: invoicesForTenant,
      payments: data.payments.filter((payment) =>
        invoiceIds.has(payment.invoiceId),
      ),
      meterReadings: data.meterReadings.filter(
        (reading) => reading.tenantId === tenant.id,
      ),
      portalLink: data.portalLinks[0],
    };
  };

  if (!hasDatabase()) return demoPortal();

  const db = getDb();
  const tokenHash = hashPortalToken(token);
  const [link] = await db
    .select()
    .from(tenantPortalLinks)
    .where(eq(tenantPortalLinks.tokenHash, tokenHash))
    .limit(1);

  if (
    !link ||
    !link.active ||
    link.revokedAt ||
    (link.expiresAt && link.expiresAt.getTime() < Date.now())
  ) {
    return demoPortal();
  }

  await db
    .update(tenantPortalLinks)
    .set({ lastViewedAt: new Date() })
    .where(eq(tenantPortalLinks.id, link.id));

  const data = await getDashboardData();
  const tenant = data.tenants.find((item) => item.id === link.tenantId);

  if (!tenant) return null;

  const invoicesForTenant = data.invoices.filter(
    (invoice) => invoice.tenantId === tenant.id,
  );
  const invoiceIds = new Set(invoicesForTenant.map((invoice) => invoice.id));

  return {
    data,
    token,
    tenant,
    invoices: invoicesForTenant,
    payments: data.payments.filter((payment) =>
      invoiceIds.has(payment.invoiceId),
    ),
    meterReadings: data.meterReadings.filter(
      (reading) => reading.tenantId === tenant.id,
    ),
    portalLink: data.portalLinks.find((item) => item.id === link.id),
  };
}

export async function getPortalInvoiceDocument(
  token: string,
  invoiceId: string,
) {
  const portal = await getTenantPortalData(token);
  const invoice = portal?.invoices.find((item) => item.id === invoiceId);
  const cycle = invoice
    ? portal?.data.cycles.find((item) => item.id === invoice.cycleId)
    : undefined;

  if (!portal || !invoice) return null;

  return {
    ...portal,
    invoice,
    cycle,
    payments: portal.payments.filter((payment) => payment.invoiceId === invoice.id),
    sessions: portal.data.paymentSessions.filter(
      (session) => session.invoiceId === invoice.id,
    ),
  };
}
