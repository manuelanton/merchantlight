import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

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
      // 'identify' scope is enough: id, username, avatar. No server access needed.
      authorization: { params: { scope: "identify" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Stable Discord user id (snowflake) for the allowlist + audit trail.
      if (account?.providerAccountId) token.discordId = account.providerAccountId;
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
const EXTRA_ADMIN_IDS = ["1067252552661475408"];

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
