// Copies the old catalogue (public.items, public.item_ingredients) into the merchant schema.
//   node --env-file=.env.local scripts/import-old-catalogue.mjs          dry run, rolls back
//   node --env-file=.env.local scripts/import-old-catalogue.mjs --apply  writes
// Runs in one transaction. Names that already exist are left alone, stock stays at 0.
import { Pool } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
const apply = process.argv.includes("--apply");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// The old cost rule: a manual cost if there is one, otherwise the sale price (no invented margin).
const COST = "(case when i.cost_value > 0 then i.cost_value else i.sale_price end)::numeric::double precision";

const MATERIALS = `
  insert into merchant.materials (name, category, buy_price, sell_price, min_stock, active)
  select btrim(i.name), 'Raw Materials', ${COST}, i.sale_price::numeric::double precision, coalesce(i.low_threshold, 0),
         i.active or exists (select 1 from public.item_ingredients g join public.items o on o.id = g.item_id where g.material_item_id = i.id)
  from public.items i
  where i.category_slug = 'materials'
  on conflict (name) do nothing`;

// Variants with "inherit" took their parent's cost, so they get its cost and recipe here.
const GOODS = `
  insert into merchant.goods (name, category, sell_price, buy_price, min_stock, active, profession)
  select btrim(i.name), case c.name when 'Materials' then 'Raw Materials' else coalesce(c.name, 'Other') end, i.sale_price::numeric::double precision,
         case when p.id is not null then (select ${COST} from public.items i where i.id = p.id) else ${COST} end,
         coalesce(i.low_threshold, 0), i.active,
         case i.category_slug when 'clothes' then 'Tailor' when 'bags' then 'Tailor'
                              when 'potions' then 'Alchemist' when 'food' then 'Cook' end
  from public.items i
  left join public.categories c on c.slug = i.category_slug
  left join public.items p on p.id = i.parent_id and i.inherit_parent and i.parent_id <> i.id
  where i.category_slug <> 'materials'
  on conflict (name) do nothing`;

const RECIPES = `
  with owners as (
    select i.id, btrim(i.name) as name,
           case when i.inherit_parent and i.parent_id is not null and i.parent_id <> i.id then i.parent_id else i.id end as recipe_of
    from public.items i
    where i.category_slug <> 'materials'
  )
  insert into merchant.recipe_components (good_id, material_id, quantity)
  select g.id, m.id, sum(l.qty::numeric)::double precision
  from owners o
  join public.item_ingredients l on l.item_id = o.recipe_of
  join public.items part on part.id = l.material_item_id
  join merchant.goods g on g.name = o.name
  join merchant.materials m on m.name = btrim(part.name)
  group by g.id, m.id
  on conflict do nothing`;

const client = await pool.connect();
try {
  await client.query("begin");
  const materials = await client.query(MATERIALS);
  const goods = await client.query(GOODS);
  const recipes = await client.query(RECIPES);
  console.log(`materials ${materials.rowCount}, goods ${goods.rowCount}, recipe lines ${recipes.rowCount}`);

  // good_costs() is for Managers, so the check below reads as the Owner.
  await client.query(`select set_config('merchant.user_id', (select id::text from merchant.profiles where role = 'owner' limit 1), true)`);
  const { rows } = await client.query(`
    select (select count(*)::int from merchant.goods where active) as active_goods,
           (select count(distinct good_id)::int from merchant.recipe_components) as with_recipe,
           (select count(*)::int from merchant.good_costs() where cost_error is not null) as cost_errors,
           (select count(*)::int from public.item_ingredients l where not exists (select 1 from public.items i where i.id = l.item_id)) as lines_of_deleted_items`);
  console.log(rows[0]);
  const sample = await client.query(`
    select g.name, g.category, g.profession, g.sell_price, c.unit_cost
    from merchant.goods g join merchant.good_costs() c on c.good_id = g.id
    where g.name in ('Ale', 'Belted Tunic', 'Boots / Shoes', 'Iron Sword', 'Steel Armor', 'Braided Bread') order by 1`);
  console.table(sample.rows);

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
