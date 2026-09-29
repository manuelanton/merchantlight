CREATE TABLE "item_ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"material_item_id" text NOT NULL,
	"material_name" text DEFAULT '' NOT NULL,
	"qty" real DEFAULT 1 NOT NULL,
	"actor_discord_id" text DEFAULT '' NOT NULL
);
