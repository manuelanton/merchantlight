import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { accessFor, type Access } from "@/lib/merchant-access";

export async function currentAccess(): Promise<Access | null> {
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  if (!session?.user || !discordId) return null;
  return accessFor(discordId);
}

export const isStaff = (a: Access | null) => !!a && ["owner", "manager", "employee"].includes(a.role);
export const isManager = (a: Access | null) => !!a && ["owner", "manager"].includes(a.role);

/** Pages and actions check again themselves: the layout only decides what is shown. */
export async function requireStaff(): Promise<Access> {
  const access = await currentAccess();
  if (!isStaff(access)) redirect("/admin");
  return access as Access;
}

export async function requireManager(): Promise<Access> {
  const access = await requireStaff();
  if (!isManager(access)) redirect("/admin");
  return access;
}
