# Merchantlight — Google Sheet template (5 min, you create manually)

You chose Google Sheets as the DB. I can't create it for you, so:

1. Create a new Google Sheet named `Merchantlight DB`.
2. Create 5 tabs with EXACT names + header rows (copy-paste):

**Categories** — header:
`id,name,slug,icon,sort_order`
rows:
```
c1,Clothes,clothes,🧥,1
c2,Bags & Containers,bags,🎒,2
c3,Armor,armor,🛡️,3
c4,Weapons,weapons,⚔️,4
c5,Potions & Alchemy,potions,🧪,5
c6,Food & Drink,food,🍞,6
c7,Trade Goods,trade-goods,📦,7
c8,Materials,materials,⛏️,8
```

**Items** — header:
`id,name,category_slug,description,sale_price,cost_value,stock,low_threshold,image_url,active,created_by_char,updated_by_char,updated_at`
rows (your current stock):
```
it-cloak-exq,Exquisite Cloak (white),clothes,"Fine white cloak",130,40,1,1,,TRUE,Cyllian Braehn,,
it-patchwork,Patchwork Satchel,bags,Sturdy everyday satchel,30,10,10,3,,TRUE,Cyllian Braehn,,
it-reinf-bag,Reinforced Backpack,bags,Reinforced travel backpack,85,30,1,1,,TRUE,Cyllian Braehn,,
it-reinf-lantern,Reinforced Backpack w/ Lantern,bags,With fitted lantern,95,38,2,1,,TRUE,Cyllian Braehn,,
it-toothlock,Toothlock Satchel,bags,Secure clasp satchel,60,22,4,2,,TRUE,Cyllian Braehn,,
it-trader-res,Trader's Resource,trade-goods,Bulk trader pack,110,45,1,1,,TRUE,Cyllian Braehn,,
it-clothes-plain,Plain Clothes,clothes,Simple clothes various,20,6,12,4,,TRUE,Cyllian Braehn,,
```

**Sales** — header:
`id,timestamp,item_id,qty,unit_sale_price,unit_cost_snapshot,total_profit,location,sold_by_char,notes`
(leave empty — app appends)

**Ledger** — header:
`id,timestamp,type,member_char,amount_gold,category,description`
rows:
```
lg-1,,contribution,Cyllian Braehn,1500,seed capital,Initial put-in
lg-2,,expense,Cyllian Braehn,-250,materials,Bars for fancy bags
```

**Orders** — header:
`id,timestamp,customer_char,discord_handle,item_id,qty,status,pickup_location,notes`
(leave empty)

3. Google Cloud (free): create project → enable Google Sheets API → create Service Account → create JSON key.
   Copy `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `private_key` → `GOOGLE_PRIVATE_KEY`.
4. In your Sheet: Share → paste service account email → Editor.
5. Copy Sheet ID from URL (`.../d/SHEET_ID/...`) → `SHEET_ID` in Vercel env + `.env.local`.
6. Redeploy. Catalogue edits in Sheet appear within ~60s; admin writes go straight to Sheet.

Without these envs the app still works on built-in seed (good for demo), but edits won't persist across Vercel restarts.
