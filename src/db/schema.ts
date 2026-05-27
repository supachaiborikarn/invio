import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "staff"]);
export const tenantStatusEnum = pgEnum("tenant_status", [
  "active",
  "paused",
  "ended",
]);
export const unitStatusEnum = pgEnum("unit_status", [
  "occupied",
  "vacant",
  "maintenance",
]);
export const cycleStatusEnum = pgEnum("cycle_status", [
  "draft",
  "open",
  "closed",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "issued",
  "partial",
  "paid",
  "overdue",
  "void",
]);
export const invoiceTypeEnum = pgEnum("invoice_type", [
  "rent",
  "electricity",
  "fuel_transport",
  "mixed",
  "other",
]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "bank_transfer",
  "promptpay",
  "other",
]);
export const paymentProviderEnum = pgEnum("payment_provider", [
  "manual",
  "stripe",
]);
export const paymentSessionStatusEnum = pgEnum("payment_session_status", [
  "created",
  "open",
  "paid",
  "expired",
  "canceled",
  "failed",
]);
export const refundStatusEnum = pgEnum("refund_status", [
  "none",
  "requested",
  "partial",
  "refunded",
  "failed",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  taxId: text("tax_id").notNull().default(""),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  bankAccountName: text("bank_account_name").notNull().default(""),
  bankAccountNumber: text("bank_account_number").notNull().default(""),
  bankName: text("bank_name").notNull().default(""),
  bankBranch: text("bank_branch").notNull().default(""),
  paymentLineId: text("payment_line_id").notNull().default(""),
  vatRateBasisPoints: integer("vat_rate_basis_points").notNull().default(700),
  vatEnabledDefault: boolean("vat_enabled_default").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const appUsers = pgTable(
  "app_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: userRoleEnum("role").notNull().default("staff"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    clerkUserUnique: uniqueIndex("app_users_clerk_user_id_unique").on(
      table.clerkUserId,
    ),
  }),
);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    contactName: text("contact_name").notNull().default(""),
    taxId: text("tax_id").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    billingAddress: text("billing_address").notNull().default(""),
    vatEnabled: boolean("vat_enabled").notNull().default(true),
    status: tenantStatusEnum("status").notNull().default("active"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantCodeUnique: uniqueIndex("tenants_org_code_unique").on(
      table.organizationId,
      table.code,
    ),
  }),
);

export const rentalUnits = pgTable(
  "rental_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    rentAmountSatang: integer("rent_amount_satang").notNull().default(0),
    electricRateSatang: integer("electric_rate_satang").notNull().default(0),
    meterSerial: text("meter_serial").notNull().default(""),
    status: unitStatusEnum("status").notNull().default("vacant"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    unitCodeUnique: uniqueIndex("rental_units_org_code_unique").on(
      table.organizationId,
      table.code,
    ),
  }),
);

export const billingCycles = pgTable(
  "billing_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    status: cycleStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    cycleLabelUnique: uniqueIndex("billing_cycles_org_label_unique").on(
      table.organizationId,
      table.label,
    ),
  }),
);

export const meterReadings = pgTable("meter_readings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => rentalUnits.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "restrict" }),
  billingCycleId: uuid("billing_cycle_id")
    .notNull()
    .references(() => billingCycles.id, { onDelete: "cascade" }),
  previousReading: integer("previous_reading").notNull(),
  currentReading: integer("current_reading").notNull(),
  usageUnits: integer("usage_units").notNull(),
  rateSatang: integer("rate_satang").notNull(),
  amountSatang: integer("amount_satang").notNull(),
  cloudinaryPublicId: text("cloudinary_public_id").notNull().default(""),
  cloudinaryAssetId: text("cloudinary_asset_id").notNull().default(""),
  cloudinarySecureUrl: text("cloudinary_secure_url").notNull().default(""),
  cloudinaryVersion: integer("cloudinary_version"),
  imageWidth: integer("image_width"),
  imageHeight: integer("image_height"),
  previousCloudinaryPublicId: text("previous_cloudinary_public_id")
    .notNull()
    .default(""),
  previousCloudinaryAssetId: text("previous_cloudinary_asset_id")
    .notNull()
    .default(""),
  previousCloudinarySecureUrl: text("previous_cloudinary_secure_url")
    .notNull()
    .default(""),
  previousCloudinaryVersion: integer("previous_cloudinary_version"),
  previousImageWidth: integer("previous_image_width"),
  previousImageHeight: integer("previous_image_height"),
  warning: text("warning").notNull().default(""),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdByUserId: uuid("created_by_user_id").references(() => appUsers.id, {
    onDelete: "set null",
  }),
});

export const tenantPortalLinks = pgTable(
  "tenant_portal_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    label: text("label").notNull().default("ลิงก์ผู้เช่า"),
    active: boolean("active").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("tenant_portal_links_token_hash_unique").on(
      table.tokenHash,
    ),
  }),
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    billingCycleId: uuid("billing_cycle_id")
      .notNull()
      .references(() => billingCycles.id, { onDelete: "restrict" }),
    invoiceNo: text("invoice_no").notNull(),
    type: invoiceTypeEnum("type").notNull().default("mixed"),
    issueDate: timestamp("issue_date", { withTimezone: true }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    subtotalSatang: integer("subtotal_satang").notNull().default(0),
    discountSatang: integer("discount_satang").notNull().default(0),
    vatRateBasisPoints: integer("vat_rate_basis_points").notNull().default(700),
    vatEnabled: boolean("vat_enabled").notNull().default(true),
    vatAmountSatang: integer("vat_amount_satang").notNull().default(0),
    totalSatang: integer("total_satang").notNull().default(0),
    paidSatang: integer("paid_satang").notNull().default(0),
    balanceSatang: integer("balance_satang").notNull().default(0),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    invoiceNoUnique: uniqueIndex("invoices_org_no_unique").on(
      table.organizationId,
      table.invoiceNo,
    ),
  }),
);

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  meterReadingId: uuid("meter_reading_id").references(() => meterReadings.id, {
    onDelete: "set null",
  }),
  type: invoiceTypeEnum("type").notNull().default("other"),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceSatang: integer("unit_price_satang").notNull().default(0),
  amountSatang: integer("amount_satang").notNull().default(0),
});

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    receiptNo: text("receipt_no").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    amountSatang: integer("amount_satang").notNull(),
    method: paymentMethodEnum("method").notNull().default("bank_transfer"),
    provider: paymentProviderEnum("provider").notNull().default("manual"),
    providerSessionId: text("provider_session_id").notNull().default(""),
    providerPaymentId: text("provider_payment_id").notNull().default(""),
    webhookEventId: text("webhook_event_id").notNull().default(""),
    refundStatus: refundStatusEnum("refund_status").notNull().default("none"),
    reference: text("reference").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdByUserId: uuid("created_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    receiptNoUnique: uniqueIndex("payments_org_receipt_unique").on(
      table.organizationId,
      table.receiptNo,
    ),
  }),
);

export const paymentSessions = pgTable("payment_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  provider: paymentProviderEnum("provider").notNull().default("stripe"),
  status: paymentSessionStatusEnum("status").notNull().default("created"),
  amountSatang: integer("amount_satang").notNull(),
  currency: text("currency").notNull().default("thb"),
  providerSessionId: text("provider_session_id").notNull().default(""),
  providerPaymentId: text("provider_payment_id").notNull().default(""),
  checkoutUrl: text("checkout_url").notNull().default(""),
  portalTokenHash: text("portal_token_hash").notNull().default(""),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: paymentProviderEnum("provider").notNull().default("stripe"),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    providerSessionId: text("provider_session_id").notNull().default(""),
    providerPaymentId: text("provider_payment_id").notNull().default(""),
    payload: text("payload").notNull().default(""),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventIdUnique: uniqueIndex("payment_events_event_id_unique").on(
      table.eventId,
    ),
  }),
);

export const invoiceAuditLogs = pgTable("invoice_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").references(() => appUsers.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  reason: text("reason").notNull().default(""),
  metadata: text("metadata").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
