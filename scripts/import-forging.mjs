// Adds the Blacksmith recipes from Daken's forging calculator to the catalogue.
//   node --env-file=.env.local scripts/import-forging.mjs          dry run, rolls back
//   node --env-file=.env.local scripts/import-forging.mjs --apply  writes
// Items that already exist keep their price and only get the recipe, if they have none yet.
import { Pool } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
const apply = process.argv.includes("--apply");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const PROFESSION = "Blacksmith";

// Materials the recipes need that aren't in the books yet: cost, sale price.
const NEW_MATERIALS = [
  ["Orichalcum Ingot", 132, 230],
  ["Malachite Ingot", 6048, 8000],
  ["Diamond", 100, 150],
  ["Flawless Amethyst", 100, 150],
  ["Flawless Diamond", 150, 300],
  ["Flawless Emerald", 50, 100],
  ["Flawless Garnet", 50, 100],
  ["Flawless Ruby", 30, 80],
  ["Flawless Sapphire", 30, 50],
];
const REACTIVATE = ["Moonstone Ingot", "Ruby", "Amethyst"];

const PARTS = {
  I: "Iron Ingot", C: "Corundum Ingot", O: "Orichalcum Ingot", M: "Moonstone Ingot", Q: "Quicksilver Ingot",
  A: "Malachite Ingot", G: "Gold Ingot", V: "Silver Ingot", L: "Leather", S: "Leather Strips", F: "Firewood",
  H: "Chaurus Chitin", R: "Ruby", P: "Sapphire", E: "Emerald", D: "Diamond", T: "Amethyst", N: "Garnet",
  fE: "Flawless Emerald", fP: "Flawless Sapphire", fN: "Flawless Garnet", fD: "Flawless Diamond",
  fT: "Flawless Amethyst", fR: "Flawless Ruby",
};
const STEEL = "X"; // Steel Ingot is a crafted item, not a material

// A name in the books that means the same thing as the calculator's.
const SAME_AS = {
  Longbow: "Long Bow",
  "Wood Axe": "Woodcutter's Axe",
  "Gold and Ruby Circlet": "Gold Ruby Circlet",
  "Orc Armor (Light) Hide": "Orcish Hide Armor",
  "Common Mail Tunic": "Common Chain Mail",
  "Steel Arrow": "Steel Arrow Bundle (80)",
};
// One entry in the books covers these three, so they start at its price.
const PRICE_OF = {
  "Steel Boots": "Steel Boots / Gloves / Helmet",
  "Steel Helmet": "Steel Boots / Gloves / Helmet",
  "Steel Gauntlets": "Steel Boots / Gloves / Helmet",
};

const W = "Weapons", R = "Armor", J = "Jewelry", T = "Trade Goods";
// name, category, price, recipe
const ITEMS = [
  ["Common Bow", W, 60, "3X 1S"],
  ["Common Mail Tunic", R, 60, "5I 3S"],
  ["Common Bow + 4x Iron Arrows", W, 100, "3X 4I 1S 4F"],
  ["Robed Iron Armor", R, 70, "5I 5S 1L"],
  ["Key", T, 30, "1I 1C 1S"],
  ["Lock", T, 50, "1I 1C"],
  ["Oil Mail and Hide", R, 60, "4L 7S 2I"],
  ["Imperial Battle Mage Armor", R, 100, "4X 3S 3L"],
  ["Iron Armor", R, 60, "5I 3S"],
  ["Iron Boots", R, 40, "3I 2S"],
  ["Iron Gauntlets", R, 30, "2I 2S"],
  ["Iron Helmet", R, 40, "3I 2S"],
  ["Iron Sword", W, 30, "2I 1S"],
  ["Iron Shield", R, 50, "4I 1S"],
  ["Iron Full Set", R, 150, "13I 9S"],
  ["Iron Combat Set", R, 220, "19I 11S"],
  ["Iron Dagger", W, 25, "1I 1S"],
  ["Iron Double Handed Weapons", W, 50, "4I 2S"],
  ["Iron War Axe", W, 30, "2I 2S"],
  ["Iron Mace", W, 40, "3I 2S"],
  ["Longbow", W, 20, "8F 1L 2S"],
  ["Iron Arrow", W, 15, "1F 1I"],
  ["Pickaxe", T, 10, "1I"],
  ["Wood Axe", T, 10, "1I"],
  ["Steel Combat Set", R, 280, "15X 11S"],
  ["Steel Full Set", R, 250, "13X 9S"],
  ["Steel Sword", W, 50, "2X 1S"],
  ["Steel Dagger", W, 40, "1I 1X 1S"],
  ["Steel Battleaxe", W, 90, "1I 4X 2S"],
  ["Steel Warhammer", W, 90, "1I 4X 3S"],
  ["Steel War Axe", W, 60, "1I 2X 2S"],
  ["Steel Mace", W, 70, "1I 3X 1S"],
  ["Steel Greatsword", W, 90, "2I 4X 3S"],
  ["Hunting Bow", W, 50, "8F 1L 2S 2X"],
  ["Steel Boots", R, 60, "3X 2S"],
  ["Steel Armor", R, 90, "5X 3S"],
  ["Steel Helmet", R, 60, "3X 2S"],
  ["Steel Gauntlets", R, 50, "2X 2S"],
  ["Steel Shield", R, 70, "4X 1S"],
  ["Steel Arrow", W, 20, "1F 1X"],
  ["Orcish Dagger", W, 400, "1O 1I 1S"],
  ["Orcish Battleaxe", W, 800, "4O 1I 2S"],
  ["Orcish Warhammer", W, 800, "4O 1I 3S"],
  ["Orcish Greatsword", W, 800, "4O 2I 3S"],
  ["Orcish War Axe/Sword", W, 500, "2O 1I 1S"],
  ["Orcish Mace", W, 650, "3O 1I 1S"],
  ["Orcish Bow", W, 500, "2O 1I"],
  ["Orcish Arrows", W, 400, "1O 1F"],
  ["Orc Armor (Light) Hide", R, 350, "1O 4L 3S"],
  ["Orc Armor (Light) Studded", R, 350, "1I 1O 4L 3S"],
  ["Orc Boots (Light)", R, 350, "1O 2L 2S"],
  ["Orc Helmet (Light)", R, 350, "1O 2L 1S"],
  ["Orc Gauntlets (Light)", R, 350, "1O 1L 2S"],
  ["Orc Full Set Light", R, 1000, "4O 9L 8S"],
  ["Orc Full Set Light + Sword & Shield", R, 1800, "9O 9L 10S"],
  ["Orc Shield", R, 600, "3O 1I 1S"],
  ["Orc Armor", R, 800, "4O 1I 3S"],
  ["Orc Boots", R, 600, "3O 1I 2S"],
  ["Orc Helmet", R, 500, "2O 1I 3S"],
  ["Orc Gauntlets", R, 500, "2O 1I 2S"],
  ["Orc Full Set Heavy", R, 2200, "11O 4I 10S"],
  ["Orc Full Set Heavy + Sword & Shield", R, 3000, "16O 6I 12S"],
  ["Leather Armor", R, 30, "4L 2S"],
  ["Northern Studded Armor", R, 40, "1I 4L 3S"],
  ["Leather Boots", R, 20, "2L 2S"],
  ["Leather Bracers", R, 20, "1L 2S"],
  ["Leather Helmet", R, 20, "2L 1S"],
  ["Leather Shield", R, 30, "4L 2S"],
  ["Leather Boiled Set", R, 70, "9L 12S 1I"],
  ["Leather Full Set", R, 60, "9L 7S"],
  ["Leather Full Set + Shield", R, 80, "13L 9S"],
  ["Elven Arrow", W, 500, "1F 1M"],
  ["Elven Dagger", W, 650, "1I 1Q 1S 1M"],
  ["Elven Battleaxe", W, 900, "2I 1Q 2S 2M"],
  ["Elven Warhammer", W, 900, "2I 1Q 3S 2M"],
  ["Elven Greatsword", W, 900, "2I 1Q 3S 2M"],
  ["Elven War Axe/Sword", W, 700, "1I 1Q 1S 1M"],
  ["Elven Mace", W, 900, "1I 1Q 1S 2M"],
  ["Elven Bow", W, 850, "1Q 2M"],
  ["Elven Armor", R, 1100, "4M 1I 3S 1L"],
  ["Gilded Elven Armor", R, 1400, "4M 1I 3S 1L 1Q"],
  ["Elven Boots", R, 650, "2M 1I 2S 1L"],
  ["Elven Helmet", R, 650, "2M 1I 1S 1L"],
  ["Elven Gauntlets", R, 500, "1M 1I 2S 1L"],
  ["Elven Shield", R, 1100, "4M 1I 2S"],
  ["Elven Full Set", R, 2500, "9M 4I 8S 4L"],
  ["Elven Full Set + Shield", R, 4000, "14M 5I 10S 4L"],
  ["Falmer Bow", W, 200, "1H 1I"],
  ["Falmer Arrows", W, 200, "1H 1F"],
  ["Falmer Sword", W, 200, "1H 1S"],
  ["Falmer War Axe", W, 200, "1H 2S"],
  ["Silver Emerald Amulet", J, 100, "1V 1fE"],
  ["Silver Necklace", J, 30, "1V"],
  ["Silver Sapphire Amulet", J, 75, "1V 1fP"],
  ["Silver Jeweled Necklace", J, 175, "1V 2fN"],
  ["Gold Necklace", J, 30, "1G"],
  ["Gold Diamond Necklace", J, 250, "1G 1fD"],
  ["Gold Jeweled Necklace", J, 300, "1G 2fT"],
  ["Gold Ruby Necklace", J, 75, "1G 1fR"],
  ["Copper and Onyx Circlet", J, 40, "1C"],
  ["Copper and Ruby Circlet", J, 50, "1C 1R"],
  ["Copper and Sapphire Circlet", J, 50, "1C 1P"],
  ["Copper and Moonstone Circlet", J, 400, "1C 1M"],
  ["Silver and Sapphire Circlet", J, 75, "2V 1P"],
  ["Silver and Moonstone Circlet", J, 400, "2V 1M"],
  ["Gold and Emerald Circlet", J, 100, "2G 1E"],
  ["Gold and Ruby Circlet", J, 75, "2G 1R"],
  ["Jade and Emerald Circlet", J, 8000, "1A 1E"],
  ["Jade and Sapphire Circlet", J, 8000, "1A 1P"],
  ["Gold Diamond Ring", J, 175, "1G 1D"],
  ["Gold Emerald Ring", J, 60, "1G 1E"],
  ["Gold Ring", J, 30, "1G"],
  ["Gold Sapphire Ring", J, 50, "1G 1P"],
  ["Silver Amethyst Ring", J, 50, "1V 1T"],
  ["Silver Garnet Ring", J, 50, "1V 1N"],
  ["Silver Ring", J, 40, "1V"],
  ["Silver Ruby Ring", J, 50, "1V 1R"],
];

// The calculator marks these prices "Incorrect!", so they stay off the public catalogue.
const GLASS = [
  ["Glass Arrows", W, 10000, "1A 1F"],
  ["Glass Bow", W, 10000, "2A 1M"],
  ["Glass Dagger", W, 22000, "1M 1A 1S"],
  ["Glass Sword", W, 18000, "1M 1A 1S"],
  ["Glass War Axe", W, 20000, "1A 2S 1M"],
  ["Glass Mace", W, 20000, "2A 1S 1M"],
  ["Glass Greatsword", W, 20000, "2A 2M 3S"],
  ["Glass Battleaxe", W, 10000, "2A 2M 2S"],
  ["Glass Warhammer", W, 5000, "3A 2M 3S"],
  ["Glass Shield", R, 10000, "1M 4A 2S"],
  ["Glass Chest", R, 5000, "2M 4A 1L 3S"],
  ["Glass Boots", R, 5000, "1M 2A 1L 2S"],
  ["Glass Gauntlets", R, 15000, "1M 1A 1L 2S"],
  ["Glass Helm", R, 15000, "1M 2A 1L 2S"],
  ["Glass Full Set", R, 65000, "5M 9A 4L 9S"],
];

const parseRecipe = (recipe) =>
  recipe.split(" ").map((p) => {
    const [, qty, key] = p.match(/^(\d+)(.+)$/);
    if (key !== STEEL && !PARTS[key]) throw new Error(`unknown part ${p}`);
    return { qty: Number(qty), key };
  });

const client = await pool.connect();
try {
  await client.query("begin");

  for (const [name, cost, price] of NEW_MATERIALS) {
    await client.query(
      `insert into merchant.materials (name, buy_price, sell_price, on_menu) values ($1, $2, $3, false) on conflict (name) do nothing`,
      [name, cost, price],
    );
  }
  await client.query(`update merchant.materials set active = true where name = any($1)`, [REACTIVATE]);
  // Recipes are made of Raw Materials, and the recipe picker only offers those.
  await client.query(`update merchant.goods set category = 'Raw Materials' where name = 'Steel Ingot'`);

  const materials = new Map((await client.query(`select id, name from merchant.materials`)).rows.map((m) => [m.name, m.id]));
  const goods = (await client.query(`select id, name, sell_price from merchant.goods`)).rows;
  const byName = new Map(goods.map((g) => [g.name.toLowerCase(), g]));
  const recipeOwners = new Set((await client.query(`select distinct good_id from merchant.recipe_components`)).rows.map((r) => r.good_id));
  const steel = byName.get("steel ingot");

  const report = { added: [], kept: [], hadRecipe: [] };
  for (const [list, onMenu] of [[ITEMS, true], [GLASS, false]]) {
    for (const [name, category, price, recipe] of list) {
      const existing = byName.get((SAME_AS[name] ?? name).toLowerCase());
      let id = existing?.id;
      if (existing) {
        report.kept.push({ pdf: name, books: existing.name, kept: existing.sell_price, pdf_price: price });
        await client.query(`update merchant.goods set profession = coalesce(profession, $1) where id = $2`, [PROFESSION, id]);
        if (recipeOwners.has(id)) { report.hadRecipe.push(existing.name); continue; }
      } else {
        const start = PRICE_OF[name] ? byName.get(PRICE_OF[name].toLowerCase()).sell_price : price;
        const row = await client.query(
          `insert into merchant.goods (name, category, sell_price, profession, on_menu) values ($1, $2, $3, $4, $5) returning id`,
          [name, category, start, PROFESSION, onMenu],
        );
        id = row.rows[0].id;
        report.added.push({ name, category, price: start, pdf_price: price });
      }
      for (const { qty, key } of parseRecipe(recipe)) {
        if (key === STEEL) {
          await client.query(`insert into merchant.recipe_components (good_id, component_good_id, quantity) values ($1, $2, $3)`, [id, steel.id, qty]);
        } else {
          const material = materials.get(PARTS[key]);
          if (!material) throw new Error(`no material ${PARTS[key]} for ${name}`);
          await client.query(`insert into merchant.recipe_components (good_id, material_id, quantity) values ($1, $2, $3)`, [id, material, qty]);
        }
      }
    }
  }

  console.log(`added ${report.added.length}, already there ${report.kept.length}, kept their recipe ${report.hadRecipe.length}`);
  console.log("ALREADY THERE (price kept)");
  console.table(report.kept);
  console.log("NEW AT ANOTHER PRICE THAN THE CALCULATOR");
  console.table(report.added.filter((a) => a.price !== a.pdf_price));

  // good_costs() is for Managers, so the check below reads as the Owner.
  await client.query(`select set_config('merchant.user_id', (select id::text from merchant.profiles where role = 'owner' limit 1), true)`);
  const { rows } = await client.query(`
    select g.name, g.sell_price, round(c.unit_cost::numeric, 2)::float as cost, c.cost_error
    from merchant.goods g join merchant.good_costs() c on c.good_id = g.id
    where g.profession = $1 and (c.cost_error is not null or c.unit_cost >= g.sell_price)
    order by g.name`, [PROFESSION]);
  console.log("SOLD AT OR BELOW COST");
  console.table(rows);

  await client.query(apply ? "commit" : "rollback");
  console.log(apply ? "written" : "dry run, nothing written");
} catch (e) {
  await client.query("rollback");
  console.error("IMPORT FAILED:", e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
