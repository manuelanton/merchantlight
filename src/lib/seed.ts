import type { Category, Item, LedgerEntry, Order, Sale } from "./types";

export const SEED_CATEGORIES: Category[] = [
  { id: "clothes", name: "Clothes", slug: "clothes", icon: "🧥", sort_order: 1 },
  { id: "bags", name: "Bags & Containers", slug: "bags", icon: "🎒", sort_order: 2 },
  { id: "combos", name: "Combos", slug: "combos", icon: "🎁", sort_order: 3 },
  { id: "armor", name: "Armor", slug: "armor", icon: "🛡️", sort_order: 4 },
  { id: "weapons", name: "Weapons", slug: "weapons", icon: "⚔️", sort_order: 5 },
  { id: "jewelry", name: "Jewelry", slug: "jewelry", icon: "💍", sort_order: 6 },
  { id: "enchantments", name: "Enchantments", slug: "enchantments", icon: "✨", sort_order: 7 },
  { id: "potions", name: "Potions & Alchemy", slug: "potions", icon: "🧪", sort_order: 7 },
  { id: "food", name: "Food & Drink", slug: "food", icon: "🍞", sort_order: 8 },
  { id: "trade-goods", name: "Trade Goods", slug: "trade-goods", icon: "📦", sort_order: 9 },
  { id: "materials", name: "Materials", slug: "materials", icon: "⛏️", sort_order: 10 },
];

type SeedRow = [id: string, name: string, cat: string, desc: string, price: number, cost: number];

// Reference price book (guild tailor list, EEC imports excluded).
// Stock defaults to 0 = "Made to order", which suits tailored goods;
// the live Google Sheet is the source of truth for real stock.
const REF: SeedRow[] = [
  // ---- clothing ----
  ["it-cowls", "Cowls", "clothes", "Bulk ×10: 10g", 15, 1.333],
  ["it-ragged-trousers", "Ragged Trousers", "clothes", "Bulk ×10: 8g", 10, 3.3],
  ["it-common-clothes", "Common Clothes", "clothes", "Bulk ×10: 15g", 20, 3.67],
  ["it-robes", "Robes", "clothes", "Bulk ×10: 30g", 25, 1.67],
  ["it-common-robes", "Common Robes", "clothes", "Bulk ×10: 30g", 25, 4],
  ["it-priest-sandals", "Priest Sandals", "clothes", "Bulk ×10: 5g", 10, 3],
  ["it-boots-shoes", "Boots / Shoes", "clothes", "Bulk ×10: 10g", 20, 2.5],
  ["it-fine-boots", "Fine Boots", "clothes", "Bulk ×10: 10g", 25, 1.5],
  ["it-hunter-fur-boots", "Hunter Fur Boots / Common Boots / (Armored) / Rogue Hide", "clothes", "Bulk ×10: 20g", 30, 1.33],
  ["it-hunter-fur-gloves", "Hunter Fur Gloves / Common Gloves / (Armored)", "clothes", "Bulk ×10: 15g", 30, 2.41],
  ["it-gloves", "Gloves", "clothes", "Bulk ×10: 8g", 25, 6],
  ["it-travellers-robes", "Traveller's Robes", "clothes", "Bulk ×10: 15g", 35, 4.3],
  ["it-surcoats-quilted", "Surcoats / Quilted", "clothes", "Bulk ×10: 15g", 35, 23],
  ["it-fine-clothes-standard", "Fine Clothes (standard)", "clothes", "Bulk ×10: 40g", 90, 3.33],
  ["it-fine-clothes-noble", "Fine Clothes (noble / named)", "clothes", "Bulk ×5: 140g", 200, 7.167],
  ["it-rugged-facemask", "Rugged Facemask", "clothes", "Bulk ×10: 10g", 15, 2],
  ["it-loose-neck-gaiter", "Loose Neck Gaiter", "clothes", "Bulk ×10: 25g", 30, 6.67],
  ["it-bosmer-mask", "Bosmer Mask", "clothes", "Bulk ×10: 20g", 25, 8.67],
  ["it-scarf-fastened", "Scarf, Fastened / Short Woven", "clothes", "Bulk ×10: 30g", 35, 9.2],
  ["it-scarf-gathered", "Scarf, Gathered", "clothes", "Bulk ×10: 17g", 35, 50],
  ["it-reinforced-mantle", "Reinforced Mantle", "clothes", "Bulk ×10: 15g", 35, 90],
  ["it-cloak-brown", "Cloak, Brown", "clothes", "Bulk ×10: 30g", 50, 90],
  ["it-cloak-black", "Cloak, Black", "clothes", "Bulk ×10: 30g", 50, 90],
  ["it-cloak-white", "Cloak, White", "clothes", "Bulk ×10: 30g", 50, 0],
  ["it-cloak-snowy-sabre", "Cloak, Snowy Sabre", "clothes", "Bulk ×10: 70g", 50, 26.67],
  ["it-cloak-vale-saber", "Cloak, Vale Saber", "clothes", "Bulk ×10: 55g", 75, 400],
  ["it-exquisite-cape-gold", "Exquisite Cape (Gold)", "clothes", "Bulk ×5: 90g", 150, 8],
  ["it-exquisite-cape-quicksilver", "Exquisite Cape (Quicksilver) (Black/Red)", "clothes", "Bulk ×5: 500g", 750, 6.67],
  ["it-linen-cape", "Linen Cape", "clothes", "Bulk ×10: 65g", 35, 0],
  ["it-leather-cape", "Leather Cape", "clothes", "", 35, 0],
  ["it-bosmer-cape", "Bosmer Cape", "clothes", "Bulk ×10: 35g", 45, 0],
  ["it-rugged-cape", "Rugged Cape / Short Cape", "clothes", "Bulk ×10: 35g", 45, 0],
  ["it-hat-doorag", "Hat (Doorag) / Mourner's Hat", "clothes", "Bulk ×10: 15g", 20, 0],
  ["it-hat", "Hat", "clothes", "", 20, 13.6],
  ["it-fine-hat", "Fine Hat", "clothes", "", 30, 400],
  ["it-rogue-hood", "Rogue Hood & Lowered", "clothes", "Bulk ×5: 15g", 35, 0],
  ["it-dunmer-outfit", "Dunmer Outfit", "clothes", "", 65, 0],
  ["it-redguard-boots", "Redguard Boots", "clothes", "", 25, 0],
  ["it-hammerfell-garb", "Hammerfell Garb", "clothes", "", 55, 0],
  ["it-alikr-hood", "Alikr Hood", "clothes", "", 35, 0],
  ["it-imperial-battlemage-hood", "Imperial Battlemage Hood", "clothes", "Bulk ×10: 25g", 65, 0],
  ["it-alikir-combo", "Alikir Hood + Hammerfell Guard + Redguard Boots", "clothes", "", 95, 0],
  ["it-mage-hood", "Mage Hood / Common Hood", "clothes", "", 35, 2.25],
  ["it-mage-robes", "Mage Robes (New) / Belted Tunic", "clothes", "Bulk ×10: 45g", 50, 2.25],
  ["it-priest-robes-new", "Priest Robes (New)", "clothes", "Bulk ×10: 55g", 65, 0],
  ["it-colovian-fur-hat", "Colovian Fur Hat (Gnome Hat)", "clothes", "", 35, 0],
  ["it-sewing-kit", "Sewing Kit", "clothes", "Bulk ×10: 12g", 15, 0],
  ["it-sewing-kit-self", "Sewing Kit Self Service", "clothes", "Bulk ×10: 10g", 10, 0],
  ["it-linen-mask", "Linen Mask", "clothes", "Bulk ×10: 30g", 35, 0],
  // ---- storage / bags ----
  ["it-sturdy-pouch", "Sturdy Pouch", "bags", "Bulk ×10: 55g", 65, 6.67],
  ["it-sturdy-pouch-black", "Sturdy Pouch, Black (quicksilver)", "bags", "", 450, 65],
  ["it-reinforced-satchel-gold", "Reinforced Satchel, Light (gold)", "bags", "Bulk ×10: 95g", 85, 6],
  ["it-reinforced-satchel-black", "Reinforced Satchel, Black (quicksilver)", "bags", "", 650, 10.5],
  ["it-traders-resources-lantern", "Trader's Resources (w/ Lantern)", "bags", "Bulk ×10: 115g", 125, 0],
  ["it-fur-collar", "Fur Collar", "bags", "Bulk ×5: 15g", 35, 0],
  // ---- combos ----
  ["it-combo-starter-satchel", "Patchwork Satchel + Common Clothes + Potato/Cabbage Soup (Starter Combo)", "combos", "Bulk ×10: 50g", 55, 0],
  ["it-combo-starter-weapon", "Common Clothes + Ancient Nord Weapon + Potato/Cabbage Soup (Starter Combo)", "combos", "", 35, 0],
  ["it-combo-pouch-backpack", "Pouch + Backpack Combo", "combos", "Bulk ×10: 90g", 125, 98],
  ["it-combo-pouch-patchwork", "Pouch + Patchwork Satchel Combo", "combos", "Bulk ×10: 90g", 75, 0],
  ["it-combo-pouch-reinforced", "Pouch + Reinforced Satchel Combo", "combos", "Bulk ×10: 110g", 115, 0],
  // ---- armor ----
  ["it-iron-tier-chest", "Iron Tier Chestpiece", "armor", "Bulk ×10: 18g", 25, 0],
  ["it-iron-extras", "Iron Boots / Gloves / Helmet", "armor", "Bulk ×10: 9g", 10, 0],
  ["it-steel-tier-chest", "Steel Tier Chestpiece", "armor", "Bulk ×10: 35g", 55, 0],
  ["it-steel-extras", "Steel Boots / Gloves / Helmet", "armor", "Bulk ×10: 16g", 40, 0],
  ["it-leather-tier-chest", "Leather Tier Chestpiece", "armor", "Bulk ×10: 18g", 45, 0],
  ["it-leather-extras", "Leather Boots / Gloves / Helmet", "armor", "Bulk ×10: 9g", 35, 0],
  // ---- jewelry ----
  ["it-silver-garnet-ring", "Silver Garnet Ring", "jewelry", "Bulk ×10: 10g", 15, 0],
  ["it-silver-ring", "Silver Ring", "jewelry", "Bulk ×10: 7g. Negotiate the price.", 10, 0],
  ["it-copper-onyx-circlet", "Copper and Onyx Circlet", "jewelry", "Bulk ×10: 20g", 25, 0],
  ["it-copper-sapphire-circlet", "Copper and Sapphire Circlet", "jewelry", "", 35, 0],
  ["it-silver-sapphire-circlet", "Silver and Sapphire Circlet", "jewelry", "", 55, 50],
  ["it-gold-emerald-ring", "Gold Emerald Ring", "jewelry", "Bulk ×10: 75g", 100, 0],
  ["it-gold-ruby-circlet", "Gold Ruby Circlet", "jewelry", "Bulk ×10: 90g", 100, 0],
  ["it-silver-necklace", "Silver Necklace", "jewelry", "Bulk ×10: 30g", 35, 0],
  // ---- materials / resources / pelts ----
  ["it-leather", "Leather", "materials", "", 4, 3.5],
  ["it-linen-wrap", "Linen Wrap", "materials", "Bulk ×5: 2g", 3, 0],
  ["it-mountain-flower", "Mountain Flower", "materials", "Bulk ×10: 1g", 1, 0],
  ["it-tundra-cotton", "Tundra Cotton", "materials", "Bulk ×5: 1g", 1, 0],
  ["it-soul-gem", "Soul Gem", "materials", "Bulk ×10: 5g", 10, 0],
  ["it-moonstone-ingot", "Moonstone Ingot", "materials", "", 250, 0],
  ["it-moonstone-ore", "Moonstone Ore", "materials", "", 40, 0],
  ["it-quicksilver-ingot", "Quicksilver Ingot", "materials", "", 250, 0],
  ["it-quicksilver-ore", "Quicksilver Ore", "materials", "", 25, 0],
  ["it-gold-ingot", "Gold Ingot", "materials", "Bulk ×10: 8g", 10, 0],
  ["it-gold-ore", "Gold Ore", "materials", "Bulk ×10: 0.75g", 1, 0],
  ["it-silver-ingot", "Silver Ingot", "materials", "Bulk ×10: 8g", 8, 0],
  ["it-silver-ore", "Silver Ore", "materials", "Bulk ×10: 0.4g", 0.5, 0],
  ["it-iron-ingot", "Iron Ingot (supply)", "materials", "", 2, 0],
  ["it-iron-ore", "Iron Ore", "materials", "", 0.25, 0],
  ["it-corundum-ingot", "Corundum Ingot", "materials", "", 2, 0],
  ["it-corundum-ore", "Corundum Ore", "materials", "", 0.25, 0],
  ["it-thread", "Thread", "materials", "", 1, 0],
  ["it-toothlock-teeth", "Toothlock Teeth", "materials", "", 3, 0],
  ["it-cave-bear-pelt", "Cave Bear Pelt", "materials", "", 1, 0],
  ["it-snow-bear-pelt", "Snow Bear Pelt", "materials", "", 6, 0],
  ["it-bear-pelt", "Bear Pelt", "materials", "", 6, 0],
  ["it-sabre-cat-pelt", "Sabre Cat Pelt", "materials", "", 6, 0],
  ["it-vale-sabre-cat-pelt", "Vale Sabre Cat Pelt", "materials", "", 20, 0],
  ["it-snowy-sabre-cat-pelt", "Snowy Sabre Cat Pelt", "materials", "", 6, 0],
];

const blank: Pick<Item, "image_url" | "active" | "created_by_char" | "updated_by_char" | "updated_at"> = {
  image_url: "",
  active: true,
  created_by_char: "",
  updated_by_char: "",
  updated_at: "",
};

export const SEED_ITEMS: Item[] = [
  // Live-sheet mirrors (kept in sync with the Google Sheet's tuned prices)
  { id: "it-cloak-exq", name: "Exquisite Cloak (white)", category_slug: "clothes", description: "Fine white cloak, tailored by Cyllian.", sale_price: 130, cost_value: 40, stock: 1, low_threshold: 1, ...blank, created_by_char: "Cyllian Braehn" },
  { id: "it-patchwork", name: "Patchwork Satchel", category_slug: "bags", description: "Sturdy everyday satchel. Bulk ×10: 25g.", sale_price: 30, cost_value: 10, stock: 10, low_threshold: 3, ...blank, created_by_char: "Cyllian Braehn" },
  { id: "it-reinf-bag", name: "Reinforced Backpack", category_slug: "bags", description: "Reinforced travel backpack. Bulk ×10: 85g.", sale_price: 85, cost_value: 30, stock: 1, low_threshold: 1, ...blank, created_by_char: "Cyllian Braehn" },
  { id: "it-reinf-lantern", name: "Reinforced Backpack w/ Lantern", category_slug: "bags", description: "Backpack with fitted lantern. Bulk ×10: 95g.", sale_price: 95, cost_value: 38, stock: 2, low_threshold: 1, ...blank, created_by_char: "Cyllian Braehn" },
  { id: "it-toothlock", name: "Toothlock Satchel", category_slug: "bags", description: "Secure clasp satchel. Bulk ×10: 55g.", sale_price: 60, cost_value: 22, stock: 4, low_threshold: 2, ...blank, created_by_char: "Cyllian Braehn" },
  { id: "it-trader-res", name: "Trader's Resource", category_slug: "bags", description: "Bulk trader boxes.", sale_price: 110, cost_value: 45, stock: 1, low_threshold: 1, ...blank, created_by_char: "Cyllian Braehn" },
  { id: "it-clothes-plain", name: "Plain Clothes", category_slug: "clothes", description: "Simple clothes, various.", sale_price: 20, cost_value: 6, stock: 12, low_threshold: 4, ...blank, created_by_char: "Cyllian Braehn" },
  // Reference price book (tailored goods — made to order until stocked in the sheet).
  // Cost is only filled where the price book gives a base cost; otherwise blank.
  ...REF.map(([id, name, category_slug, description, sale_price, cost_value]): Item => ({
    id, name, category_slug, description, sale_price, cost_value,
    stock: 0, low_threshold: 2, ...blank,
  })),
];

export const SEED_SALES: Sale[] = [];

export const SEED_LEDGER: LedgerEntry[] = [
  { id: "lg-1", timestamp: new Date().toISOString(), type: "contribution", member_char: "Cyllian Braehn", amount_gold: 1500, category: "seed capital", description: "Initial put-in (>1.5k)" },
  { id: "lg-2", timestamp: new Date().toISOString(), type: "expense", member_char: "Cyllian Braehn", amount_gold: -250, category: "materials", description: "Bars for fancy bags (gold/silver, Namhar Winterhold 15g each 10+)" },
];

export const SEED_ORDERS: Order[] = [];
