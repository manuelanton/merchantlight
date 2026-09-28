# Merchantlight Company — Gallow's Rock, Eastmarch (Keizaal)

Customer-facing catalogue. The Google Sheet is the quartermaster:
stock and prices are edited directly in the Sheet, the site only reads.

## Run locally

```bash
cd merchantlight
cp .env.example .env.local   # optional until Sheets is linked
npm run dev                  # http://localhost:3100 (or :3000)
```

- Section index: `/`, one full page per section: `/catalog/:slug`

Works out of the box on built-in seed data (cloaks/satchels/backpacks).

## Logo

Sigil lives at `public/logo.png` (copied from `public/Merchantlight Logo.png`). Header + favicon use it.

Font: `Cinzel Decorative` (Trajan-like, closest free match to Skyrim's carved look) + `Cinzel` + `Spectral`. Loaded in `src/app/layout.tsx`.

## Google Sheets

See `SHEET_TEMPLATE.md` for the guild guide (Items, Categories, Sales, Restocks tabs). Then:

1. Enable Sheets API, make a Service Account, get JSON key — OR just share read-only (see guide).
2. Share sheet with service-account email (Editor), or "Anyone with the link" (Viewer) for read-only.
3. Set in `.env.local` + Vercel env: `SHEET_ID` (+ service-account keys if using writes).
4. Redeploy — catalogue revalidates every 60s.

## Deploy to Vercel + GitHub

Repo: https://github.com/manuelanton/merchantlight

Vercel → Import → set the `SHEET_ID` env var. Pushes to `master` autodeploy. No login/auth to configure.
