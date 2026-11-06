# Schema `merchant`

The new business logic, ported once from Darkwater Forge and then changed for the General
Goods Store (`*_store_rules.sql`). It lives next to the old tables in
`public` and is not used by the running app yet. Nothing here has been applied to Neon.

## How access works

The server opens a transaction and runs:

```sql
set local role merchant_app;
select set_config('merchant.user_id', '<profile id>', true);
```

`merchant_auth.uid()` reads that setting, so RLS and grants behave as they did on Supabase.
Profiles are written with `merchant.upsert_discord_profile()` on the owner connection, never
as `merchant_app`.

`src/lib/merchant-db.ts` does this. The app's way in is `POST /api/merchant/rpc/<function>`.

Roles come from the Discord server, mapped in `src/shop/config.ts` (`discord`). They are read at
login and re-checked by the bot (`DISCORD_BOT_TOKEN`) every 5 minutes, see
`src/lib/merchant-access.ts`. The role is stored on the profile, not in the session cookie.

## Files

- `migrations/`: run in filename order. Applied ones are never edited, add a new one instead.

## Tests

```bash
npm run test:db
```

Runs every migration on PGlite, also once as a non-superuser owner.

## Store rules

- Stock works like the Tavern: a sale takes what was sold, bundles (`goods.is_bundle`) take their
  parts, nothing is refused, stock may go negative.
- Profit plus other income minus expenses is divided by the Owners and Managers, week by week
  (Monday to Sunday, UTC). `close_partner_week()` fixes a week, `partner_balances()` and
  `pay_partner()` track what was paid. Purchases are not expenses: they are in the sales' cost.
- Commission is off. The Forge's quota, rank and order functions are still in the schema, unused.
