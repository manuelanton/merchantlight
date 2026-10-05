import { deleteNoteAction, postNoteAction, resolveNoteAction } from "@/lib/admin-actions";
import { getBooks } from "@/lib/books";
import Collapsible from "@/components/Collapsible";

export const dynamic = "force-dynamic";

const KINDS = [
  { v: "news", label: "📯 News" },
  { v: "request", label: "🙏 Request" },
  { v: "todo", label: "☑️ To-do" },
  { v: "stock", label: "📦 Stock request" },
];

const KIND_ICON: Record<string, string> = { news: "📯", request: "🙏", todo: "☑️", stock: "📦" };

export default async function NotesPage() {
  const b = await getBooks();
  const open = b.noteRows.filter((n) => !n.resolved);
  const done = b.noteRows.filter((n) => n.resolved);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Noticeboard</h1>
      <p className="text-sm text-[#8a7c64]">
        Logistics notes for quartermasters — news, requests, to-dos, stock calls. Keeps it out of chat.
      </p>

      <Collapsible title="Post a note" defaultOpen action={postNoteAction}>
        <div className="grid md:grid-cols-4 gap-3">
          <div><label className="lbl">Kind</label>
            <select name="kind" className="input">
              {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
            </select>
          </div>
          <div className="md:col-span-3"><label className="lbl">Title *</label><input name="title" required className="input" placeholder="e.g. Need more iron ingots" /></div>
        </div>
        <div><label className="lbl">Details</label><textarea name="body" rows={2} className="input" placeholder="Who can make it, by when…" /></div>
        <div className="flex justify-end">
          <button className="btn-gold !py-2 !px-5 text-sm" type="submit">Post note</button>
        </div>
      </Collapsible>

      <div className="space-y-3">
        <h2 className="font-display text-lg">Open ({open.length})</h2>
        {open.map((n) => (
          <div key={n.id} className="card p-4 flex flex-wrap gap-3 items-start">
            <div className="min-w-[220px] flex-1">
              <p><span className="mr-1">{KIND_ICON[n.kind] || "•"}</span><b>{n.title}</b></p>
              {n.body && <p className="text-sm text-[#8a7c64] mt-1">{n.body}</p>}
              <p className="text-xs text-[#8a7c64] mt-1">
                {n.authorName} · {new Date(n.timestamp).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              <form action={resolveNoteAction}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="resolved" value="false" />
                <button className="btn-ghost !py-1 !px-2 text-xs" type="submit">Resolve ✓</button>
              </form>
              <form action={deleteNoteAction}>
                <input type="hidden" name="id" value={n.id} />
                <button className="btn-ghost !py-1 !px-2 text-xs" type="submit" title="Delete note">✕</button>
              </form>
            </div>
          </div>
        ))}
        {!open.length && <p className="text-sm text-[#8a7c64]">All quiet.</p>}
      </div>

      {done.length > 0 && (
        <details>
          <summary className="text-sm text-[#c9a227] cursor-pointer">Resolved ({done.length})</summary>
          <ul className="text-sm text-[#8a7c64] mt-2 space-y-1">
            {done.map((n) => (
              <li key={n.id} className="flex items-center gap-2">
                <span className="line-through">{n.title}</span>
                <form action={resolveNoteAction} className="inline">
                  <input type="hidden" name="id" value={n.id} />
                  <input type="hidden" name="resolved" value="true" />
                  <button className="btn-ghost !py-0.5 !px-2 text-xs" type="submit">Reopen</button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
