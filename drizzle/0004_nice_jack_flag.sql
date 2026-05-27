ALTER TABLE "meter_readings" ADD COLUMN "previous_cloudinary_public_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD COLUMN "previous_cloudinary_asset_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD COLUMN "previous_cloudinary_secure_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD COLUMN "previous_cloudinary_version" integer;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD COLUMN "previous_image_width" integer;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD COLUMN "previous_image_height" integer;