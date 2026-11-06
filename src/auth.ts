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
      // Stable Discord user id (snowflake) for the audit trail.
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
