import { Empty, Notice, PageHeader, Section } from "@/components/store-ui";
import { requireOwner } from "@/lib/store-access";
import { setProfitShareAction } from "@/lib/store-actions";
import { listTeam } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Users({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const access = await requireOwner();
  const { error } = await searchParams;
  const team = await listTeam(access.profileId);
  const sharing = team.filter((u) => u.shares).length;

  return (
    <>
      <PageHeader title="Users" subtitle="Roles come from Discord. The switch decides who shares the profit." />
      <Notice error={error} />

      <Section title="Team" aside={sharing === 1 ? "1 person shares" : `${sharing} people share`}>
        <div className="panel overflow-x-auto">
          <table className="ledger min-w-[26rem]">
            <thead><tr><th>Name</th><th>Role</th><th className="text-right">Shares profit</th></tr></thead>
            <tbody>
              {team.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}{!u.in_guild && <span className="muted text-xs"> · left the server</span>}</td>
                  <td className="capitalize">{u.role}</td>
                  <td className="text-right">
                    <form action={setProfitShareAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="on" value={u.shares ? "0" : "1"} />
                      <button
                        type="submit"
                        role="switch"
                        aria-checked={u.shares}
                        aria-label={`${u.name} shares the profit`}
                        className={`inline-flex h-6 w-11 items-center rounded-full border px-0.5 cursor-pointer ${u.shares ? "justify-end bg-[#9a4d12] border-[#d97a1f]" : "justify-start bg-[#0f0d0b] border-[#4a3d2a]"}`}
                      >
                        <span className={`h-4 w-4 rounded-full ${u.shares ? "bg-[#e8dcc4]" : "bg-[#6b6152]"}`} />
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!team.length && <Empty>Nobody has signed in yet.</Empty>}
        </div>
      </Section>
      <p className="muted text-xs">
        Everyone switched on gets an equal share. Weeks already closed keep their shares; a change counts from the next week you close. People show up here after their first login.
      </p>
    </>
  );
}
