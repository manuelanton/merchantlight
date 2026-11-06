import { SHOP } from "@/shop/config";

export type AppRole = "owner" | "manager" | "employee" | "supplier" | "visitor";

export interface DiscordMember {
  roles: string[];
  nick: string | null;
  avatar: string | null;
  user?: { id: string; username?: string; global_name?: string | null; avatar?: string | null };
}

export type Lookup =
  | { status: "member"; member: DiscordMember }
  | { status: "not_member" }
  | { status: "unavailable"; reason: string };

const API = "https://discord.com/api/v10";

async function discordGet(url: string, authorization: string): Promise<Lookup> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: authorization }, cache: "no-store" });
    if (res.status === 404) return { status: "not_member" };
    if (res.status === 429) {
      const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
      await new Promise((r) => setTimeout(r, Math.min(Number(body.retry_after ?? 1), 5) * 1000));
      continue;
    }
    // 401/403: expired token or missing scope. That says nothing about membership.
    if (!res.ok) return { status: "unavailable", reason: `discord ${res.status}` };
    return { status: "member", member: (await res.json()) as DiscordMember };
  }
  return { status: "unavailable", reason: "discord rate limit" };
}

/** Ask Discord for a member: the login's OAuth token if we have one, else the bot. */
export async function lookupMember(discordId: string, oauthToken?: string): Promise<Lookup> {
  const guild = SHOP.discord.guildId;
  if (oauthToken) {
    const r = await discordGet(`${API}/users/@me/guilds/${guild}/member`, `Bearer ${oauthToken}`);
    if (r.status !== "unavailable") return r;
  }
  const bot = process.env.DISCORD_BOT_TOKEN;
  if (bot) return discordGet(`${API}/guilds/${guild}/members/${discordId}`, `Bot ${bot}`);
  return { status: "unavailable", reason: "no DISCORD_BOT_TOKEN set" };
}

export function isOwnerAccount(discordId?: string | null): boolean {
  const owner = (process.env.SUPERADMIN_DISCORD_ID || "").trim() || SHOP.discord.ownerId;
  return !!owner && !!discordId && discordId === owner;
}

export function mapRole(roleIds: string[], discordId: string): AppRole {
  if (isOwnerAccount(discordId)) return "owner";
  const held = new Set(roleIds);
  return SHOP.discord.roles.find((r) => held.has(r.discordRoleId))?.role ?? "visitor";
}

export function avatarUrl(discordId: string, member: DiscordMember): string | null {
  if (member.avatar) {
    return `https://cdn.discordapp.com/guilds/${SHOP.discord.guildId}/users/${discordId}/avatars/${member.avatar}.png?size=128`;
  }
  return member.user?.avatar ? `https://cdn.discordapp.com/avatars/${discordId}/${member.user.avatar}.png?size=128` : null;
}
