import type { Category, Item, LedgerEntry, Order, Sale } from "./types";

export const SEED_CATEGORIES: Category[] = [
  { id: "c1", name: "Clothes", slug: "clothes", icon: "🧥", sort_order: 1 },
  { id: "c2", name: "Bags & Containers", slug: "bags", icon: "🎒", sort_order: 2 },
  { id: "c3", name: "Armor", slug: "armor", icon: "🛡️", sort_order: 3 },
  { id: "c4", name: "Weapons", slug: "weapons", icon: "⚔️", sort_order: 4 },
  { id: "c5", name: "Potions & Alchemy", slug: "potions", icon: "🧪", sort_order: 5 },
  { id: "c6", name: "Food & Drink", slug: "food", icon: "🍞", sort_order: 6 },
  { id: "c7", name: "Trade Goods", slug: "trade-goods", icon: "📦", sort_order: 7 },
  { id: "c8", name: "Materials", slug: "materials", icon: "⛏️", sort_order: 8 },
];

export const SEED_ITEMS: Item[] = [
  { id: "it-cloak-exq", name: "Exquisite Cloak (white)", category_slug: "clothes", description: "Fine white cloak, tailored by Cyllian.", sale_price: 130, cost_value: 40, stock: 1, low_threshold: 1, image_url: "", active: true, created_by_char: "Cyllian Braehn", updated_by_char: "", updated_at: "" },
  { id: "it-patchwork", name: "Patchwork Satchel", category_slug: "bags", description: "Sturdy everyday satchel.", sale_price: 30, cost_value: 10, stock: 10, low_threshold: 3, image_url: "", active: true, created_by_char: "Cyllian Braehn", updated_by_char: "", updated_at: "" },
  { id: "it-reinf-bag", name: "Reinforced Backpack", category_slug: "bags", description: "Reinforced travel backpack.", sale_price: 85, cost_value: 30, stock: 1, low_threshold: 1, image_url: "", active: true, created_by_char: "Cyllian Braehn", updated_by_char: "", updated_at: "" },
  { id: "it-reinf-lantern", name: "Reinforced Backpack w/ Lantern", category_slug: "bags", description: "Backpack with fitted lantern.", sale_price: 95, cost_value: 38, stock: 2, low_threshold: 1, image_url: "", active: true, created_by_char: "Cyllian Braehn", updated_by_char: "", updated_at: "" },
  { id: "it-toothlock", name: "Toothlock Satchel", category_slug: "bags", description: "Secure clasp satchel.", sale_price: 60, cost_value: 22, stock: 4, low_threshold: 2, image_url: "", active: true, created_by_char: "Cyllian Braehn", updated_by_char: "", updated_at: "" },
  { id: "it-trader-res", name: "Trader's Resource", category_slug: "trade-goods", description: "Bulk trader's pack.", sale_price: 110, cost_value: 45, stock: 1, low_threshold: 1, image_url: "", active: true, created_by_char: "Cyllian Braehn", updated_by_char: "", updated_at: "" },
  { id: "it-clothes-plain", name: "Plain Clothes", category_slug: "clothes", description: "Simple clothes, various.", sale_price: 20, cost_value: 6, stock: 12, low_threshold: 4, image_url: "", active: true, created_by_char: "Cyllian Braehn", updated_by_char: "", updated_at: "" },
  { id: "it-iron-ingot", name: "Iron Ingot (supply)", category_slug: "materials", description: "Smelted iron for the forge.", sale_price: 12, cost_value: 8, stock: 0, low_threshold: 10, image_url: "", active: true, created_by_char: "", updated_by_char: "", updated_at: "" },
];

export const SEED_SALES: Sale[] = [];

export const SEED_LEDGER: LedgerEntry[] = [
  { id: "lg-1", timestamp: new Date().toISOString(), type: "contribution", member_char: "Cyllian Braehn", amount_gold: 1500, category: "seed capital", description: "Initial put-in (>1.5k)" },
  { id: "lg-2", timestamp: new Date().toISOString(), type: "expense", member_char: "Cyllian Braehn", amount_gold: -250, category: "materials", description: "Bars for fancy bags (gold/silver, Namhar Winterhold 15g each 10+)" },
];

export const SEED_ORDERS: Order[] = [];
