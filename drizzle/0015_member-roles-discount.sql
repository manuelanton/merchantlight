ALTER TABLE "members" ADD COLUMN "role" text DEFAULT 'worker' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "discord_id" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "discount" real DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "members" SET "role" = 'manager' WHERE "active" = true;