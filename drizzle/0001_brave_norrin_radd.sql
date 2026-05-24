CREATE TYPE "public"."payment_provider" AS ENUM('manual', 'stripe');--> statement-breakpoint
CREATE TYPE "public"."payment_session_status" AS ENUM('created', 'open', 'paid', 'expired', 'canceled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('none', 'requested', 'partial', 'refunded', 'failed');--> statement-breakpoint
CREATE TABLE "invoice_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"metadata" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" "payment_provider" DEFAULT 'stripe' NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"provider_session_id" text DEFAULT '' NOT NULL,
	"provider_payment_id" text DEFAULT '' NOT NULL,
	"payload" text DEFAULT '' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" "payment_provider" DEFAULT 'stripe' NOT NULL,
	"status" "payment_session_status" DEFAULT 'created' NOT NULL,
	"amount_satang" integer NOT NULL,
	"currency" text DEFAULT 'thb' NOT NULL,
	"provider_session_id" text DEFAULT '' NOT NULL,
	"provider_payment_id" text DEFAULT '' NOT NULL,
	"checkout_url" text DEFAULT '' NOT NULL,
	"portal_token_hash" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_portal_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text DEFAULT 'ลิงก์ผู้เช่า' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider" "payment_provider" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_session_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_payment_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "webhook_event_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_status" "refund_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_audit_logs" ADD CONSTRAINT "invoice_audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_audit_logs" ADD CONSTRAINT "invoice_audit_logs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_audit_logs" ADD CONSTRAINT "invoice_audit_logs_actor_user_id_app_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_portal_links" ADD CONSTRAINT "tenant_portal_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_portal_links" ADD CONSTRAINT "tenant_portal_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_portal_links" ADD CONSTRAINT "tenant_portal_links_created_by_user_id_app_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_event_id_unique" ON "payment_events" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_portal_links_token_hash_unique" ON "tenant_portal_links" USING btree ("token_hash");