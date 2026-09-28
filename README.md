# Merchantlight Company — Windhelm / Eastmarch (Keizaal)

Customer-facing catalogue + order requests. The Google Sheet is the quartermaster:
stock, prices and sales are edited directly in the Sheet, the site only reads
(the single write is the public order form → Orders tab).

## Run locally

```bash
cd merchantlight
cp .env.example .env.local   # optional until Sheets is linked
npm run dev                  # http://localhost:3100 (or :3000)
```

- Catalogue: `/`, per-category price lists: `/catalog/:slug`
- Order form: `/order`

Works out of the box on built-in seed data (cloaks/satchels/backpacks).

## Logo

Sigil lives at `public/logo.png` (copied from `public/Merchantlight Logo.png`). Header + favicon use it.

Font: `Cinzel Decorative` (Trajan-like, closest free match to Skyrim's carved look) + `Cinzel` + `Spectral`. Loaded in `src/app/layout.tsx`.

## Google Sheets

See `SHEET_TEMPLATE.md` for the 5-tab template (Categories, Items, Sales, Ledger, Orders). Then:

1. Enable Sheets API, make a Service Account, get JSON key.
2. Share sheet with service-account email (Editor).
3. Set in `.env.local` + Vercel env: `SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`.
4. Redeploy — catalogue revalidates every 60s; orders append to the Orders tab.

## Deploy to Vercel + GitHub

Repo: https://github.com/manuelanton/merchantlight

Vercel → Import → set the three Sheet env vars. No login/auth to configure.
