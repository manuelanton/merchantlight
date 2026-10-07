ALTER TABLE "items" ADD COLUMN "low_threshold" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "buy_price" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "max_stock" integer;