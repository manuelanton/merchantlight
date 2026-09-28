import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { loginAction } from "@/lib/actions";

export default async function AdminLogin() {
  const s = await getAdminSession();
  if (s.isAdmin) redirect("/admin");
  return (
    <div className="max-w-md space-y-4">
      <h1 className="font-display text-3xl">Quartermaster login</h1>
      <p className="text-sm text-[#8a7c64]">Shared company password + your character name (used to track who added what).</p>
      <form action={loginAction} className="card p-5 space-y-4">
        <div><label className="lbl">Character name</label><input name="charName" required className="input" placeholder="e.g. Cyllian Braehn" list="chars" />
          <datalist id="chars"><option value="Cyllian Braehn" /><option value="Nalion Duryan" /></datalist>
        </div>
        <div><label className="lbl">Company password</label><input name="password" type="password" required className="input" /></div>
        <button className="btn-gold w-full" type="submit">Enter the books</button>
        <p className="text-xs text-[#8a7c64]">Default dev password is <code>merchantlight</code> — set ADMIN_PASSWORD in Vercel.</p>
      </form>
    </div>
  );
}
