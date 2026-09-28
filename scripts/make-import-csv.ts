import { writeFileSync } from "node:fs";
import { SEED_ITEMS } from "../src/lib/seed";

// IDs already present in the live Google Sheet — never overwrite the guild's tuned prices/stock.
const IN_SHEET = new Set([
  "it-cloak-exq",
  "it-patchwork",
  "it-reinf-bag",
  "it-reinf-lantern",
  "it-toothlock",
  "it-trader-res",
  "it-clothes-plain",
]);

const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
// Slim columns matching the guild's Items tab: name, category, price, cost, stock, visible.
const header = ["name","category_slug","sale_price","cost_value","stock","active"];
const lines = [header.map(q).join(",")];
for (const it of SEED_ITEMS) {
  if (IN_SHEET.has(it.id)) continue;
  // Every row carries name, price, cost (blank when unknown), and stock.
  const cost = it.cost_value ? it.cost_value : "";
  lines.push([it.name, it.category_slug, it.sale_price, cost, 0, "TRUE"].map(q).join(","));
}
writeFileSync("sheet-import-new-items.csv", lines.join("\n"));
console.log(`wrote sheet-import-new-items.csv with ${lines.length - 1} new items`);
