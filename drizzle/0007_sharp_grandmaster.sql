CREATE TABLE "storage_units" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"occupant" text DEFAULT '' NOT NULL,
	"occupied_since" timestamp with time zone,
	"paid_through" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL
);
