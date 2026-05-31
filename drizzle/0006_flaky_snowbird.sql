CREATE TABLE "invoice_carryovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"source_invoice_id" uuid,
	"source_invoice_no" text DEFAULT '' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"period_label" text DEFAULT '' NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"unit_price_satang" integer DEFAULT 0 NOT NULL,
	"amount_satang" integer DEFAULT 0 NOT NULL,
	"included_in_total" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issuer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tax_id" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"bank_account_name" text DEFAULT '' NOT NULL,
	"bank_account_number" text DEFAULT '' NOT NULL,
	"bank_name" text DEFAULT '' NOT NULL,
	"bank_branch" text DEFAULT '' NOT NULL,
	"payment_line_id" text DEFAULT '' NOT NULL,
	"promptpay_id" text DEFAULT '' NOT NULL,
	"vat_rate_basis_points" integer DEFAULT 700 NOT NULL,
	"vat_enabled_default" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "service_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "trip_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "display_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "issuer_profile_id" uuid;--> statement-breakpoint
WITH inserted_profiles AS (
	INSERT INTO "issuer_profiles" (
		"organization_id",
		"name",
		"tax_id",
		"address",
		"phone",
		"email",
		"bank_account_name",
		"bank_account_number",
		"bank_name",
		"bank_branch",
		"payment_line_id",
		"promptpay_id",
		"vat_rate_basis_points",
		"vat_enabled_default",
		"active",
		"is_default"
	)
	SELECT
		"id",
		"name",
		"tax_id",
		"address",
		"phone",
		"email",
		"bank_account_name",
		"bank_account_number",
		"bank_name",
		"bank_branch",
		"payment_line_id",
		"promptpay_id",
		"vat_rate_basis_points",
		"vat_enabled_default",
		true,
		true
	FROM "organizations"
	RETURNING "id", "organization_id"
)
UPDATE "invoices"
SET "issuer_profile_id" = inserted_profiles."id"
FROM inserted_profiles
WHERE "invoices"."organization_id" = inserted_profiles."organization_id"
	AND "invoices"."issuer_profile_id" IS NULL;--> statement-breakpoint
ALTER TABLE "invoice_carryovers" ADD CONSTRAINT "invoice_carryovers_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_carryovers" ADD CONSTRAINT "invoice_carryovers_source_invoice_id_invoices_id_fk" FOREIGN KEY ("source_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuer_profiles" ADD CONSTRAINT "issuer_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issuer_profiles_org_name_unique" ON "issuer_profiles" USING btree ("organization_id","name");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issuer_profile_id_issuer_profiles_id_fk" FOREIGN KEY ("issuer_profile_id") REFERENCES "public"."issuer_profiles"("id") ON DELETE set null ON UPDATE no action;
