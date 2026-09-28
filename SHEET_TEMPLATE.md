# Merchantlight stock sheet — guild guide (no coding needed)

The website reads this sheet. You edit words and numbers, the site updates by itself within a minute or two.

## Tabs

### 1. `Items` — the important one (also accepts: Stock, Inventory, Products, Goods)

Headers, in any order. Only these 6 — everything else was removed on purpose:

| name | category_slug | sale_price | cost_value | stock | active |
|---|---|---|---|---|---|
| Reinforced Backpack | bags | 85 | 30 | 1 | TRUE |
| Plain Clothes | clothes | 20 | | 12 | TRUE |

- **name** — item name. IDs are generated from the name automatically; nobody needs to fill them in.
- **category_slug** — plain section word (`clothes`, `bags`, `armor`, `materials`...). New words create new sections by themselves.
- **sale_price** — what customers pay, in gold. Just the number (`85`, or even `85g`).
- **cost_value** — what it cost you (your books only, NEVER shown on the site). Leave blank when unknown.
- **stock** — how many you have. `0` shows as "Out / Made to order".
  ⚠️ This column is a **formula** (see below) — never type in it. Your manual counts live in `start stock`.
- **start stock** — your manual count. This is the only stock number you ever type.
- **active** — `TRUE` to list it, `FALSE` to hide it.

No description, image, or low-threshold columns — deleted, the site doesn't need them.

### 2. `Categories` — the sections (optional)

Only needed for custom order/icons. Skip it and sections appear automatically from the category column.

| name | slug | icon | sort_order |
|---|---|---|---|
| Clothes | clothes | 🧥 | 1 |

### 3. `Sales` — your sales log

Headers: `item | amount | price | total sale | notes`. Write the item name exactly as in Items.

- **total sale** fills itself in with the formula below — never type in that column.
- **stock** in Items drops automatically — never adjust it by hand for sales.

### 4. `Restocks` — your stock-in log (whenever you craft, buy, or find more)

Headers: `item | amount | notes`. A restock is just a row, same as a sale:

| item | amount | notes |
|---|---|---|
| Reinforced Backpack | 3 | Cyllian crafting batch |
| Iron Ore | 20 | mined Darkwater |

Adding stock = adding a row. You never edit `start stock` after setup and never touch the `stock` formula column. Every movement in or out is a visible row with a note — full history for free.

## Sales total formula

Click cell **D2** (first row under "total sale") and paste:

```
=IF(OR(B2="",C2=""),"",B2*C2)
```

Then double-click the little square at the corner of D2 to fill it down the whole column. From then on, `4 clothes at 15 each` shows `60` by itself.

## Automatic stock (paste-once formula — no scripts, no permissions)

`stock` is computed as **start stock + restocks − sales**. Set it up once, it covers new rows forever:

1. In the Items tab, rename cell **E1** from `stock` to `start stock` (your counts stay exactly where they are — you set this once and never touch it again).
2. Insert a column after it: right-click column **F** → **Insert 1 column left**. Name the new **F1** `stock` (your `active` column shifts right — that's fine).
3. Create a **`Restocks`** tab with headers `item | amount | notes` (can be empty for now — the formula tolerates a missing tab, but create it so restocking works).
4. Click **F2** and paste this (one line):

```
=ARRAYFORMULA(IF(A2:A="",,IF(E2:E+IFERROR(SUMIF(Restocks!$A:$A,A2:A,Restocks!$B:$B),0)-SUMIF(Sales!$A:$A,A2:A,Sales!$B:$B)<0,0,E2:E+IFERROR(SUMIF(Restocks!$A:$A,A2:A,Restocks!$B:$B),0)-SUMIF(Sales!$A:$A,A2:A,Sales!$B:$B))))
```

That's it. New rows in Sales subtract, new rows in Restocks add, new items get the formula automatically. Item names must match between tabs.

Rules of thumb: edit cells, never rename the tab names, never delete the header row, never type in a formula column. If a sale was logged wrong, delete that Sales row and re-add it — stocks recalculate themselves.
