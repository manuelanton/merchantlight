import { avatarUrl, lookupMember, mapRole, type AppRole } from "@/lib/discord";
import { asService } from "@/lib/merchant-db";

/** How long a role is trusted before the bot asks Discord again. */
const RECHECK_MS = 5 * 60 * 1000;

interface ProfileRow {
  id: string;
  display_name: string | null;
  username: string | null;
  role: AppRole;
  last_synced_at: Date | string | null;
}

export interface Access {
  profileId: string;
  name: string;
  role: AppRole;
}

const UPSERT = "select * from merchant.upsert_discord_profile($1, $2, $3, $4, $5, $6, $7)";

/** Write the real Discord role to the profile. Null = Discord gave no answer, nothing changed. */
export async function syncMember(discordId: string, oauthToken?: string): Promise<ProfileRow | null> {
  const lookup = await lookupMember(discordId, oauthToken);
  if (lookup.status === "unavailable") {
    console.warn(`discord role check failed for ${discordId}: ${lookup.reason}`);
    return null;
  }
  const member = lookup.status === "member" ? lookup.member : null;
  const user = member?.user;
  const rows = await asService<ProfileRow>(UPSERT, [
    discordId,
    user?.username ?? null,
    // Server nickname = in-game name, like the Tavern and the Forge.
    member?.nick ?? user?.global_name ?? null,
    member ? avatarUrl(discordId, member) : null,
    mapRole(member?.roles ?? [], discordId),
    member !== null,
    !!oauthToken,
  ]);
  return rows[0];
}

/** Who this Discord account is right now. Roles live in the DB, not the session cookie,
 *  so a role removed in Discord ends access at the next check, not at the next login. */
export async function accessFor(discordId: string): Promise<Access | null> {
  const rows = await asService<ProfileRow>("select * from merchant.profiles where discord_id = $1", [discordId]);
  let profile: ProfileRow | null = rows[0] ?? null;
  const syncedAt = profile?.last_synced_at ? new Date(profile.last_synced_at).getTime() : 0;
  if (Date.now() - syncedAt > RECHECK_MS) {
    // No answer from Discord: keep the last known role until it answers again.
    profile = (await syncMember(discordId)) ?? profile;
  }
  if (!profile) return null;
  return { profileId: profile.id, name: profile.display_name ?? profile.username ?? "Unknown", role: profile.role };
}
