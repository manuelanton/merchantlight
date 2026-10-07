import { boolean, integer, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
/** Catalogue sections. Managed in /admin/items once migrated off the sheet. */
export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  icon: text("icon").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Catalogue items. Prices shown publicly; cost is quartermaster-only. */
export const items = pgTable("items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  categorySlug: text("category_slug").notNull(),
  description: text("description").notNull().default(""),
  salePrice: real("sale_price").notNull().default(0),
  costValue: real("cost_value").notNull().default(0),
  active: boolean("active").notNull().default(true),
  lowThreshold: integer("low_threshold"),
  buyPrice: real("buy_price").notNull().default(0),
  maxStock: integer("max_stock"),
  createdByDiscordId: text("created_by_discord_id").notNull().default(""),
  createdByName: text("created_by_name").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  parentId: text("parent_id"),
  inheritParent: boolean("inherit_parent").notNull().default(true),
});

/** One recorded sale. Prices snapshotted so later catalogue edits don't rewrite history. */
export const sales = pgTable("sales", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  itemId: text("item_id").notNull(),
  itemName: text("item_name").notNull(),
  qty: integer("qty").notNull(),
  unitSalePrice: real("unit_sale_price").notNull(),
  unitCostSnapshot: real("unit_cost_snapshot").notNull().default(0),
  totalProfit: real("total_profit").notNull().default(0),
  location: text("location").notNull().default("Darkwater Crossing"),
  soldByDiscordId: text("sold_by_discord_id").notNull().default(""),
  soldByName: text("sold_by_name").notNull().default(""),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("pending"),
  confirmedBy: text("confirmed_by").notNull().default(""),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

/** Every stock movement that isn't a sale: restocks, corrections, spoilage. */
export const stockMoves = pgTable("stock_moves", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  itemId: text("item_id").notNull(),
  itemName: text("item_name").notNull(),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull().default(""),
  actorDiscordId: text("actor_discord_id").notNull().default(""),
  actorName: text("actor_name").notNull().default(""),
  maker: text("maker").notNull().default(""),
});

/** Company books: contributions, expenses (incl. rent), payouts, sale income. */
export const ledger = pgTable("ledger", {  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  type: text("type").notNull(), // contribution | expense | payout | sale_income
  member: text("member").notNull().default(""),
  amountGold: real("amount_gold").notNull(),
  category: text("category").notNull().default(""),
  description: text("description").notNull().default(""),
  actorDiscordId: text("actor_discord_id").notNull().default(""),
});

/** Noticeboard: news, requests, todos, stock requests. In-app so logistics stay out of chat. */export const notes = pgTable("notes", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  kind: text("kind").notNull().default("news"),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  authorDiscordId: text("author_discord_id").notNull().default(""),
  authorName: text("author_name").notNull().default(""),
  resolved: boolean("resolved").notNull().default(false),
});

/** Key-value shop settings (open/closed toggle etc.). Admin-written, publicly read. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Recipe lines: what an item is made of. Cost math uses live catalogue costs. */
export const itemIngredients = pgTable("item_ingredients", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull(),
  materialItemId: text("material_item_id").notNull(),
  materialName: text("material_name").notNull().default(""),
  qty: real("qty").notNull().default(1),
  actorDiscordId: text("actor_discord_id").notNull().default(""),
});

/** Sale lifecycle: pending = gold still with the salesperson, confirmed = deposited. */

/** Rentable storage chests/barrels. Income posts straight to company coffers (unattributed). */
export const storageUnits = pgTable("storage_units", {
  id: text("id").primaryKey(),
  label: text("label").notNull().default(""),
  ratePerWeek: real("rate_per_week").notNull().default(60),
  occupant: text("occupant").notNull().default(""),
  occupiedSince: timestamp("occupied_since", { withTimezone: true }),
  paidThrough: timestamp("paid_through", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  location: text("location").notNull().default("Darkwater Crossing"),
  kind: text("kind").notNull().default("rental"),
  secured: boolean("secured").notNull().default(false),
});

/** Cash pots: where physical gold sits (register lockbox vs safe). */
export const cashPots = pgTable("cash_pots", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});

/** Cash movements between pots (and in from sales / out to payouts). */
export const cashMoves = pgTable("cash_moves", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  pot: text("pot").notNull(),
  delta: real("delta").notNull(),
  reason: text("reason").notNull().default(""),
  actorDiscordId: text("actor_discord_id").notNull().default(""),
  actorName: text("actor_name").notNull().default(""),
});

/** Explicit member roster. Splits use active members; history keeps old names as text. */
export const members = pgTable("members", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  active: boolean("active").notNull().default(true),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});
