import { z } from "zod";

export const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  icon: z.string().default(""),
  sort_order: z.coerce.number().default(0),
});
export type Category = z.infer<typeof CategorySchema>;

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  category_slug: z.string(),
  description: z.string().default(""),
  sale_price: z.coerce.number().default(0),
  cost_value: z.coerce.number().default(0),
  stock: z.coerce.number().default(0),
  parent_id: z.string().nullish(),
  low_threshold: z.number().nullish(),
  buy_price: z.coerce.number().default(0),
  max_stock: z.number().nullish(),
  image_url: z.string().default(""),
  active: z.union([z.boolean(), z.string()]).transform((v) =>
    v === true || v === "TRUE" || v === "true" || v === "1" ? true : v === false || v === "FALSE" || v === "false" || v === "0" ? false : Boolean(v)
  ).default(true),
  created_by_char: z.string().default(""),
  updated_by_char: z.string().default(""),
  updated_at: z.string().default(""),
});
export type Item = z.infer<typeof ItemSchema>;

export const SaleSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  item_id: z.string(),
  qty: z.coerce.number(),
  unit_sale_price: z.coerce.number(),
  unit_cost_snapshot: z.coerce.number().default(0),
  total_profit: z.coerce.number().default(0),
  location: z.string().default("Windhelm"),
  sold_by_char: z.string().default(""),
  notes: z.string().default(""),
});
export type Sale = z.infer<typeof SaleSchema>;

export const LedgerEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: z.enum(["contribution", "expense", "payout", "sale_income"]),
  member_char: z.string(),
  amount_gold: z.coerce.number(),
  category: z.string().default(""),
  description: z.string().default(""),
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const OrderSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  customer_char: z.string(),
  discord_handle: z.string().default(""),
  item_id: z.string(),
  qty: z.coerce.number().default(1),
  status: z.enum(["new", "accepted", "fulfilled", "cancelled"]).default("new"),
  pickup_location: z.string().default("Windhelm"),
  notes: z.string().default(""),
});
export type Order = z.infer<typeof OrderSchema>;

export const PICKUP_LOCATIONS = ["Windhelm", "Darkwater Crossing", "Whiterun", "Winterhold"] as const;
export const LEDGER_TYPES = ["contribution", "expense", "payout", "sale_income"] as const;
