CREATE TABLE "ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"member" text DEFAULT '' NOT NULL,
	"amount_gold" real NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"actor_discord_id" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"item_id" text NOT NULL,
	"item_name" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_sale_price" real NOT NULL,
	"unit_cost_snapshot" real DEFAULT 0 NOT NULL,
	"total_profit" real DEFAULT 0 NOT NULL,
	"location" text DEFAULT 'Gallow''s Rock' NOT NULL,
	"sold_by_discord_id" text DEFAULT '' NOT NULL,
	"sold_by_name" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"item_id" text NOT NULL,
	"item_name" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"actor_discord_id" text DEFAULT '' NOT NULL,
	"actor_name" text DEFAULT '' NOT NULL
);
