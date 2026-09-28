// Feature flags — ship dark, enable per environment in Vercel.
//   ENABLE_BACKOFFICE=1   → /admin (Discord-gated books + catalogue manager)
//   CATALOGUE_SOURCE=db   → public catalogue reads Postgres; otherwise the Google Sheet
// Defaults (both unset): exactly the current production behavior.

export function backofficeEnabled(): boolean {
  return process.env.ENABLE_BACKOFFICE === "1";
}

export function dbCatalogueEnabled(): boolean {
  return process.env.CATALOGUE_SOURCE === "db";
}
