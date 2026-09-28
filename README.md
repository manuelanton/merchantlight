# Merchantlight Company — Windhelm / Eastmarch (Keizaal)

Customer catalogue + order requests (public) and quartermaster back-office (shared-password login).

## Run locally

```bash
cd merchantlight
cp .env.example .env.local   # set ADMIN_PASSWORD + SESSION_SECRET
npm run dev                  # http://localhost:3000
```

- Catalogue: `/`, per-category price lists: `/catalog/:slug`
- Order form: `/order`
- Back-office: `/admin` → `/admin/login` (character name + `ADMIN_PASSWORD`; dev default `merchantlight`)

Works out of the box on built-in seed data (your cloaks/satchels/backpacks + 1500g contribution / 250g bars expense).

## Logo

Save the three-hound sigil from chat as `public/logo.png` (square PNG). Header + favicon pick it up automatically; until then a 🕯️ fallback shows.

Font: `Cinzel Decorative` (Trajan-like, closest free match to Skyrim's carved look) + `Cinzel` + `Spectral`. Loaded in `src/app/layout.tsx`. Runic alternatives: Uncial Antiqua, Metamorphous.

## Google Sheets (optional, recommended)

See `SHEET_TEMPLATE.md` for the 5-tab template (Categories, Items, Sales, Ledger, Orders). Then:

1. Enable Sheets API, make a Service Account, get JSON key.
2. Share sheet with service-account email (Editor).
3. Set in `.env.local` + Vercel env: `SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`.
4. Redeploy — catalogue revalidates every 60s; admin writes go to Sheets.

## Deploy to Vercel + GitHub

```bash
gh repo create merchantlight --private --source=. --push
# Vercel → Add New Project → Import merchantlight → set env:
# ADMIN_PASSWORD, SESSION_SECRET, (optional) SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY
```

No commits made automatically — review `git status` first.
