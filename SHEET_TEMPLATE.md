# Merchantlight stock sheet — guild guide (no coding needed)

The website shows your items and prices. You edit words and numbers, the site updates by itself within a minute or two.

## Tabs

### 1. `Items` — the important one (also accepts: Stock, Inventory, Products, Goods)

Headers, in any order — just these:

| name | category | price | cost | active |
|---|---|---|---|---|
| Reinforced Backpack | bags | 85 | 30 | TRUE |
| Plain Clothes | clothes | 20 | | TRUE |

- **name** — item name. That's it, no IDs or codes needed.
- **category** — plain section word (`clothes`, `bags`, `armor`, `materials`...). New words create new sections by themselves.
- **price** — what customers pay, in gold. Just the number (`85`, or even `85g`).
- **cost** — optional, what it cost you (your books only, NEVER shown on the site). Leave blank when unknown.
- **active** — `TRUE` to list it, `FALSE` to hide it.

### 2. `Categories` — the sections (optional)

Only needed for custom order/icons. Skip it and sections appear automatically from the category column.

| name | slug | icon | sort_order |
|---|---|---|---|
| Clothes | clothes | 🧥 | 1 |

### 3. `Sales` — your sales log (optional)

Headers: `item | amount | price | total sale | notes`. Write the item name exactly as in Items. For an automatic total, click cell **D2** and paste `=IF(OR(B2="",C2=""),"",B2*C2)`, then double-click the fill square to copy it down.

Stock tracking lives here later (admin tab); for now the site shows items and prices only.

Rules of thumb: edit cells, never rename the tab names, never delete the header row.
