CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text DEFAULT 'news' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"author_discord_id" text DEFAULT '' NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL
);
