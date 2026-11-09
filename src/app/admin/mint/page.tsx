import ConfirmButton from "@/components/ConfirmButton";
import MintForm from "@/components/MintForm";
import { Empty, Notice, PageHeader, Pager, Section, Stat } from "@/components/store-ui";
import { pageHref } from "@/lib/date-range";
import { g } from "@/lib/format";
import { isManager, requireStaff } from "@/lib/store-access";
import { deleteMintAction } from "@/lib/store-actions";
import { listMintables, listMints, mintWeek, weekStart } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Mint({ searchParams }: { searchParams: Promise<{ error?: string; page?: string }> }) {
  const access = await requireStaff();
  const manager = isManager(access);
  const params = await searchParams;
  const page = Math.max(0, Math.floor(Number(params.page)) || 0);
  const [ingots, { rows, total }, week] = await Promise.all([
    listMintables(access.profileId),
    listMints(access.profileId, page),
    mintWeek(access.profileId, weekStart()),
  ]);
  const dayAgo = Date.now() - 86_400_000;

  return (
    <>
      <PageHeader title="Minting" subtitle="Gold and Silver Ingots go to the mint and come back as septims. Counts toward the profit like a sale." />
      <Notice error={params.error} />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Minted this week" value={`${g(week.amount)}g`} />
        <Stat label="Ingots used" value={g(week.quantity)} />
        <Stat label="Profit on them" value={`${g(week.amount - week.cost)}g`} tone={week.amount < week.cost ? "bad" : undefined} />
      </div>

      <div className="mb-8">
        {ingots.length ? <MintForm ingots={ingots} manager={manager} /> : <div className="panel"><Empty>No ingot can be minted. Gold Ingot and Silver Ingot need to be active materials.</Empty></div>}
      </div>

      <Section title="Mintings" aside="Deleting one puts the ingots back on the shelf and takes the septims out of the treasury.">
        <div className="panel overflow-x-auto mb-2">
          <table className="ledger min-w-[42rem]">
            <thead>
              <tr><th>#</th><th>Date</th><th>Ingot</th><th className="text-right">Ingots</th><th className="text-right">Each</th><th className="text-right">Septims</th><th>By</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="muted tabular-nums">{m.mint_no}</td>
                  <td className="tabular-nums">{new Date(m.mint_date).toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td>{m.material_name}{m.note && <span className="muted text-xs"> · {m.note}</span>}</td>
                  <td className="text-right tabular-nums">{g(m.quantity)}</td>
                  <td className="text-right tabular-nums">{g(m.rate)}g</td>
                  <td className="text-right tabular-nums">{g(m.amount)}g</td>
                  <td className="muted text-sm">{m.minted_by_name ?? "Unknown"}</td>
                  <td className="text-right">
                    {(manager || (m.mine && new Date(m.created_at).getTime() > dayAgo)) && (
                      <form action={deleteMintAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <ConfirmButton message={`Delete minting #${m.mint_no}? The ${g(m.quantity)} ingots go back on the shelf.`} className="btn-ghost !py-1 !px-2 text-sm"><span aria-label={`Delete minting #${m.mint_no}`}>×</span></ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty>Nothing minted yet.</Empty>}
        </div>
        <Pager page={page} total={total} href={(p) => pageHref("/admin/mint", { page: p ? String(p) : undefined })} />
      </Section>
    </>
  );
}
