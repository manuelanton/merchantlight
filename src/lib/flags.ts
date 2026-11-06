// Feature flags — ship dark, enable per environment in Vercel.
//   ENABLE_BACKOFFICE=1   → /admin (Discord-gated books + catalogue manager)

export function backofficeEnabled(): boolean {
  return process.env.ENABLE_BACKOFFICE === "1";
}
