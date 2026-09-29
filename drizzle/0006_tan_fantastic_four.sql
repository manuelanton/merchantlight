ALTER TABLE "sales" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "confirmed_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "confirmed_at" timestamp with time zone;