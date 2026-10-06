CREATE TABLE "cash_moves" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"pot" text NOT NULL,
	"delta" real NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"actor_discord_id" text DEFAULT '' NOT NULL,
	"actor_name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_pots" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "cash_pots_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "location" SET DEFAULT 'Darkwater Crossing';--> statement-breakpoint
ALTER TABLE "storage_units" ADD COLUMN "location" text DEFAULT 'Darkwater Crossing' NOT NULL;--> statement-breakpoint
ALTER TABLE "storage_units" ADD COLUMN "kind" text DEFAULT 'rental' NOT NULL;--> statement-breakpoint
ALTER TABLE "storage_units" ADD COLUMN "secured" boolean DEFAULT false NOT NULL;