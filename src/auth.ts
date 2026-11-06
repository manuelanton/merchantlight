import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { syncMember } from "@/lib/merchant-access";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Discord({
      // Explicit names: Auth.js would otherwise look for AUTH_DISCORD_ID/SECRET.
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      // Discord now sends `iss` with its OAuth response; without an explicit
      // issuer Auth.js expects a dummy fallback and rejects the callback.
      issuer: "https://discord.com",
      // guilds.members.read: the login's own token can read the user's server roles.
      authorization: { params: { scope: "identify guilds.members.read" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Stable Discord user id (snowflake) for the allowlist + audit trail.
      if (account?.providerAccountId) {
        token.discordId = account.providerAccountId;
        // A failed sync must not block login: accessFor() tries again with the bot.
        await syncMember(account.providerAccountId, account.access_token).catch((e) =>
          console.error("discord role sync failed at login", e),
        );
      }
      return token;
    },
    async session({ session, token }) {
      (session as unknown as { discordId?: string }).discordId =
        typeof token.discordId === "string" ? token.discordId : token.sub;
      return session;
    },
  },
});

/** Extra quartermasters baked in so nobody has to touch Vercel env.
 *  FotherMucker — remove once ADMIN_DISCORD_IDS covers them. */
const EXTRA_ADMIN_IDS = ["146826443924439040", "189458155053252608", "238657914364100609", "1067252552661475408", "869972180472037476", "463889359200976897", "430182287754133506", "353653095521320961"];

/** Discord user ids allowed into /admin. No server admin needed to manage this list. */
export function adminIds(): string[] {
  const fromEnv = (process.env.ADMIN_DISCORD_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...fromEnv, ...EXTRA_ADMIN_IDS])];
}

export function isQuartermaster(discordId?: string | null): boolean {
  if (!discordId) return false;
  return adminIds().includes(discordId);
}

export function isEmployeeRole(discordId?: string | null): boolean {
  // will be checked against members; placeholder for quick checks
  if (!discordId) return false;
  return false;
}
